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
