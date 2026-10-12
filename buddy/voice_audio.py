import asyncio
import hashlib
import io
import json
import logging
import secrets
import time
import wave
from collections import OrderedDict
from datetime import datetime, timezone

import websockets

from buddy.agent import build_agent_settings
from buddy.bridge import DEEPGRAM_URL
from buddy.sheets import IntegrationError

logger = logging.getLogger("JESSICA")


class VoiceAudio:
    def __init__(self, settings, store):
        self.settings = settings
        self.store = store
        self.cache = OrderedDict()
        self.jobs = {}
        self.tokens = {}
        self.slots = asyncio.Semaphore(2)
        self.static_texts = set()

    def cache_path(self, text):
        identity = json.dumps(
            [
                self.settings.tts_provider,
                self.settings.tts_model,
                self.settings.tts_voice,
                "pcm24k-v1",
                text,
            ]
        )
        digest = hashlib.sha256(identity.encode()).hexdigest()
        return self.settings.data_dir / "voice-cache" / (digest + ".wav")

    def load_static(self, text):
        path = self.cache_path(text)
        try:
            if path.stat().st_size > 8388652:
                return
            audio = path.read_bytes()
            with wave.open(io.BytesIO(audio), "rb") as wav:
                if wav.getparams()[:3] != (1, 2, 24000) or wav.getnframes() < 1:
                    return
                if len(wav.readframes(wav.getnframes())) != wav.getnframes() * 2:
                    return
            self.cache[text] = audio
        except (OSError, ValueError, wave.Error, EOFError):
            return

    async def synthesize(self, text: str) -> bytes:
        payload = build_agent_settings(
            self.settings, {"date": "", "next_section": "consent"}, transport="browser"
        )
        payload["agent"]["greeting"] = text
        payload["agent"]["think"].pop("functions")
        payload["agent"]["think"]["prompt"] = (
            "Read the greeting exactly as supplied. Do not continue the conversation."
        )
        started = time.monotonic()
        audio = bytearray()
        async with self.slots, asyncio.timeout(20):
            async with websockets.connect(
                DEEPGRAM_URL,
                additional_headers={"Authorization": f"Token {self.settings.deepgram_api_key}"},
                open_timeout=10,
                close_timeout=0.1,
                max_size=1048576,
            ) as connection:
                await connection.send(json.dumps(payload))
                while True:
                    message = await connection.recv()
                    if isinstance(message, bytes):
                        audio.extend(message)
                        if len(audio) > 8388608:
                            raise ValueError("Voice response is too large")
                        continue
                    event = json.loads(message)
                    if event["type"] == "Error":
                        logger.error(
                            "Deepgram voice request failed | %s", event.get("code", "unknown")
                        )
                        raise ValueError("Jessica voice request rejected")
                    if event["type"] == "AgentAudioDone":
                        break
        if not audio or len(audio) % 2:
            raise ValueError("Voice provider returned invalid PCM audio")
        output = io.BytesIO()
        with wave.open(output, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(24000)
            wav.writeframes(audio)
        result = output.getvalue()
        if text in self.static_texts:
            path = self.cache_path(text)
            try:
                path.parent.mkdir(parents=True, exist_ok=True)
                temporary = path.with_name(path.name + "." + secrets.token_hex(4) + ".tmp")
                temporary.write_bytes(result)
                temporary.replace(path)
            except OSError:
                logger.warning("Static voice cache could not be saved; keeping audio in memory")
        self.cache[text] = result
        self.cache.move_to_end(text)
        while len(self.cache) > 32:
            self.cache.popitem(last=False)
        logger.info("Audio ready | Jessica | %.2fs", time.monotonic() - started)
        return result

    def prepare(self, text: str):
        if text not in self.cache and text not in self.jobs:
            if len(self.jobs) >= 64:
                raise ValueError("Voice queue is full")
            job = asyncio.create_task(self.synthesize(text))
            self.jobs[text] = job
            job.add_done_callback(lambda task: self.completed(text, task))

    def completed(self, text, task):
        if not task.cancelled():
            task.exception()
        if self.jobs.get(text) is task:
            self.jobs.pop(text, None)

    async def prewarm(self, texts):
        for text in dict.fromkeys(texts):
            self.static_texts.add(text)
            if text not in self.cache:
                self.load_static(text)
            self.prepare(text)
        cached = sum(text in self.cache for text in dict.fromkeys(texts))
        try:
            await asyncio.gather(
                *(self.jobs[text] for text in dict.fromkeys(texts) if text in self.jobs)
            )
            logger.info(
                "Static questions ready | %s cached, %s generated",
                cached,
                len(dict.fromkeys(texts)) - cached,
            )
        except Exception:
            raise IntegrationError(
                "Jessica audio could not be prepared. Check Deepgram voice access and credits before calling."
            ) from None

    def register(self, session_id: str, text: str) -> str:
        now = time.monotonic()
        self.tokens = {token: value for token, value in self.tokens.items() if value[3] > now}
        if len(self.tokens) >= 64 or len(text) > 3000:
            raise ValueError("Voice response limit reached")
        session = self.store.get(session_id)
        self.prepare(text)
        token = secrets.token_urlsafe(24)
        self.tokens[token] = (session_id, session["call_sid"], text, now + 900)
        return f"{self.settings.public_url}/audio/{token}.wav"

    async def fetch(self, token: str) -> bytes:
        if token not in self.tokens:
            raise KeyError("Audio not found")
        session_id, call_sid, text, expires = self.tokens[token]
        session = self.store.get(session_id)
        active = session["call_status"] in {
            "starting",
            "queued",
            "initiated",
            "ringing",
            "in-progress",
        }
        age = (
            datetime.now(timezone.utc) - datetime.fromisoformat(session["updated_at"])
        ).total_seconds()
        if (
            expires < time.monotonic()
            or session["call_sid"] != call_sid
            or (not active and age > 60)
        ):
            raise KeyError("Audio expired")
        if text in self.cache:
            return self.cache[text]
        self.prepare(text)
        try:
            return await asyncio.wait_for(asyncio.shield(self.jobs[text]), timeout=12)
        except Exception:
            logger.error(
                "Jessica playback was not ready in time. Captured answers remain on your computer."
            )
            raise IntegrationError("Voice audio is unavailable") from None

    async def close(self):
        for job in self.jobs.values():
            if not job.done():
                job.cancel()
        await asyncio.gather(*self.jobs.values(), return_exceptions=True)
        self.jobs.clear()
        self.tokens.clear()
        self.cache.clear()
