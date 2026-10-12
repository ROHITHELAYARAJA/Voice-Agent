import asyncio
import logging
import threading
import time
import wave
from pathlib import Path

from buddy.sheets import IntegrationError

logger = logging.getLogger("WHISPER")


class WhisperSTT:
    def __init__(self, settings):
        self.settings = settings
        self.model = None
        self.device = None
        self.lock = threading.Lock()

    async def check(self):
        try:
            await asyncio.to_thread(self.load)
        except Exception as exc:
            raise IntegrationError(
                "Local Whisper is not ready. Run uv run --extra whisper python setup_whisper.py. "
                + type(exc).__name__
            ) from None

    def load(self):
        import torch
        import whisper

        with self.lock:
            if self.model is not None:
                return
            requested = self.settings.whisper_device
            self.device = (
                "cuda"
                if requested == "auto" and torch.cuda.is_available()
                else "cpu"
                if requested == "auto"
                else requested
            )
            if self.device == "cuda" and not torch.cuda.is_available():
                raise ValueError("CUDA is unavailable")
            self.model = whisper.load_model(
                self.settings.whisper_model,
                device=self.device,
                download_root=str(self.settings.data_dir / "whisper-models"),
            )
            logger.info(
                "Ready | OpenAI Whisper %s | %s | Tamil transcription",
                self.settings.whisper_model,
                self.device,
            )

    def decode(self, pcm: bytes) -> str:
        import numpy as np

        if not self.model:
            raise ValueError("Whisper has not been loaded")
        if not 5120 <= len(pcm) <= 960000 or len(pcm) % 2:
            return ""
        samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768
        if np.sqrt(np.mean(samples * samples)) < 0.004:
            return ""
        started = time.monotonic()
        with self.lock:
            result = self.model.transcribe(
                samples,
                language=self.settings.conversation_language,
                task="transcribe",
                fp16=self.device == "cuda",
                temperature=0,
                beam_size=1,
                condition_on_previous_text=False,
                initial_prompt="தமிழ் மற்றும் English கலந்த தினசரி உரையாடல். பணத் தொகைகள், வேலை, கற்றல்.",
                no_speech_threshold=0.6,
                logprob_threshold=-1.0,
                compression_ratio_threshold=2.4,
                verbose=None,
            )
        segments = result.get("segments", [])
        trusted = [
            segment
            for segment in segments
            if segment.get("no_speech_prob", 0) < 0.6
            and segment.get("avg_logprob", -10) >= -1.0
            and segment.get("compression_ratio", 0) <= 2.4
        ]
        text = " ".join(segment.get("text", "").strip() for segment in trusted).strip()
        logger.info("Transcription ready | %.2fs | %s", time.monotonic() - started, self.device)
        return text[:4000]

    async def transcribe(self, pcm):
        return await asyncio.to_thread(self.decode, pcm)

    async def transcribe_file(self, path: Path):
        from math import gcd

        import numpy as np
        from scipy.signal import resample_poly

        with wave.open(str(path), "rb") as wav:
            if (
                wav.getsampwidth() != 2
                or wav.getnchannels() != 1
                or wav.getnframes() > wav.getframerate() * 30
            ):
                raise ValueError("Use a mono 16-bit PCM WAV of at most 30 seconds")
            rate = wav.getframerate()
            pcm = wav.readframes(wav.getnframes())
        samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32)
        factor = gcd(rate, 16000)
        converted = resample_poly(samples, 16000 // factor, rate // factor)
        return await self.transcribe(np.clip(converted, -32768, 32767).astype("<i2").tobytes())
