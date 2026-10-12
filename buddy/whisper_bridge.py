import asyncio
import base64
import json
import logging
import secrets
import time

from fastapi import WebSocketDisconnect

from buddy.bridge import VoiceBridge
from buddy.models import AnswerInput, CompleteInput, EndInput, MoneyEntry, Section
from buddy.sheets import IntegrationError
from buddy.stream_audio import MulawDecoder, SpeechGate, telephone_audio
from buddy.whisper_stt import WhisperSTT

logger = logging.getLogger("WHISPER CALL")


class WhisperBridge(VoiceBridge):
    def __init__(self, runtime):
        super().__init__(runtime.settings, runtime.store, runtime.checkin, runtime.sheets)
        self.phone = runtime.phone
        self.stt = WhisperSTT(runtime.settings)

    async def check(self):
        if self.settings.phone_voice_provider != "eleven_labs":
            raise IntegrationError("Whisper calls require PHONE_VOICE_PROVIDER=eleven_labs")
        await self.stt.check()
        await self.phone.check()

    async def run(self, websocket):
        await websocket.accept()
        session_id = None
        claimed = False
        error = None
        try:
            start = await self.start_message(websocket)
            session = self.validate_start(start)
            session_id = session["id"]
            self.active_sessions.add(session_id)
            claimed = True
            if self.stt.model is None:
                raise IntegrationError("Whisper must be prepared before dialing")
            self.store.update(session_id, call_status="in-progress")
            logger.info("Local Tamil recognition connected | %s", start["callSid"])
            await self.relay_local(websocket, session_id, start["streamSid"])
        except WebSocketDisconnect:
            pass
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            error = "Whisper call interrupted: " + type(exc).__name__
            logger.warning("%s; saved answers remain available", error)
        finally:
            if claimed:
                self.active_sessions.discard(session_id)
                if self.store.get(session_id)["status"] not in {"completed", "declined"}:
                    self.checkin.end(
                        session_id, EndInput(reason=error or "Call ended before confirmation")
                    )
                self.store.update(session_id, call_status="completed", call_error=error)
                self.sync.wake.set()
                await self.phone.ai.close()
            try:
                await websocket.close()
            except RuntimeError:
                pass

    async def relay_local(self, twilio, session_id, stream_sid, gate=None):
        pass
