import asyncio
import base64
import binascii
import json
import logging
import secrets
import time

import websockets
from fastapi import WebSocket, WebSocketDisconnect

from buddy.agent import build_agent_settings
from buddy.checkin import CheckinService
from buddy.sheets import SheetsSync
from buddy.storage import Store
from config import Settings

logger = logging.getLogger("DEEPGRAM")
call_log = logging.getLogger("TWILIO")
DEEPGRAM_URL = "wss://agent.deepgram.com/v1/agent/converse"


class VoiceBridge:
    def __init__(self, settings: Settings, store: Store, checkin: CheckinService, sync: SheetsSync):
        self.settings = settings
        self.store = store
        self.checkin = checkin
        self.sync = sync
        self.active_sessions: set[str] = set()

    async def start_message(self, websocket: WebSocket) -> dict:
        async with asyncio.timeout(15):
            for _ in range(5):
                message = json.loads(await websocket.receive_text())
                if message.get("event") == "start":
                    return message["start"]
        raise ValueError("Missing Twilio start event")

    def validate_start(self, start: dict) -> dict:
        parameters = start.get("customParameters", {})
        session = self.store.get(parameters.get("session_id", ""))
        media_format = start.get("mediaFormat", {})
        if not secrets.compare_digest(parameters.get("stream_token", ""), session["stream_token"]):
            raise ValueError("Invalid stream token")
        if (
            start.get("accountSid") != self.settings.twilio_account_sid
            or start.get("callSid") != session["call_sid"]
        ):
            raise ValueError("Stream does not belong to this call")
        if media_format != {"encoding": "audio/x-mulaw", "sampleRate": 8000, "channels": 1}:
            raise ValueError("Unsupported audio format")
        if not start.get("streamSid") or session["id"] in self.active_sessions:
            raise ValueError("Duplicate or invalid stream")
        if session["status"] in {"completed", "declined"}:
            raise ValueError("Check-in is closed")
        return session

    async def run(self, websocket: WebSocket) -> None:
        await websocket.accept()
        session_id = None
        claimed = False
        failure = None
        try:
            start = await self.start_message(websocket)
            session = self.validate_start(start)
            session_id = session["id"]
            self.active_sessions.add(session_id)
            claimed = True
            call_log.info(
                "Media stream connected | call %s | check-in %s", start["callSid"], session_id
            )
            self.store.update(session_id, call_status="in-progress", call_error=None)
            async with websockets.connect(
                DEEPGRAM_URL,
                additional_headers={"Authorization": f"Token {self.settings.deepgram_api_key}"},
                open_timeout=15,
                close_timeout=3,
                max_size=2**20,
                max_queue=16,
            ) as agent:
                logger.info(
                    "Authenticated | sending settings | %s | ElevenLabs Jessica",
                    self.settings.llm_model,
                )
                await agent.send(
                    json.dumps(build_agent_settings(self.settings, self.checkin.state(session_id)))
                )
                await self.relay(websocket, agent, session_id, start["streamSid"])
        except (WebSocketDisconnect, websockets.exceptions.ConnectionClosed):
            failure = "The audio connection closed. Your saved answers are available to resume."
        except TimeoutError:
            failure = "The call reached its time or silence limit. Your saved answers are available to resume."
        except (ValueError, KeyError, binascii.Error):
            failure = "The call stream could not be validated or contained invalid data."
        except asyncio.CancelledError:
            failure = "The server stopped. Your saved answers are available to resume."
            raise
        except Exception:
            failure = (
                "The voice connection failed. Check your Deepgram configuration and try again."
            )
            logger.warning("Voice connection failed for session %s", session_id or "unverified")
        finally:
            if claimed:
                self.active_sessions.discard(session_id)
                session = self.store.get(session_id)
                changes = {"call_status": "completed", "call_error": failure}
                if session["status"] not in {"completed", "declined"}:
                    changes["status"] = "interrupted"
                self.store.update(session_id, **changes)
                self.sync.wake.set()
                call_log.info(
                    "Media stream closed | check-in %s | %s",
                    session_id,
                    self.store.get(session_id)["status"],
                )
                if failure:
                    logger.warning("%s", failure)
            try:
                await websocket.close()
            except RuntimeError:
                pass

    async def relay(self, twilio: WebSocket, agent, session_id: str, stream_sid: str) -> None:
        settings_ready = asyncio.Event()
        finished = asyncio.Event()
        sending = asyncio.Lock()
        end_requested = False
        end_requested_at = 0.0
        final_mark = None
        audio_active = False
        last_activity = time.monotonic()

        async def send_twilio(message: dict) -> None:
            async with sending:
                await twilio.send_json({"streamSid": stream_sid, **message})

        async def mark_end() -> None:
            nonlocal final_mark
            if final_mark is None:
                final_mark = "buddy-end-" + secrets.token_hex(8)
                await send_twilio({"event": "mark", "mark": {"name": final_mark}})

        async def from_agent() -> None:
            nonlocal end_requested, end_requested_at, audio_active, last_activity
            async for message in agent:
                if isinstance(message, bytes):
                    audio_active = True
                    last_activity = time.monotonic()
                    await send_twilio(
                        {
                            "event": "media",
                            "media": {"payload": base64.b64encode(message).decode("ascii")},
                        }
                    )
                    continue
                event = json.loads(message)
                kind = event.get("type")
                if kind == "SettingsApplied":
                    settings_ready.set()
                    logger.info("Settings accepted | listening, thinking and speaking are ready")
                elif kind == "UserStartedSpeaking":
                    last_activity = time.monotonic()
                    audio_active = False
                    await send_twilio({"event": "clear"})
                    logger.info("User speaking | cleared buffered speech")
                elif kind == "ConversationText":
                    last_activity = time.monotonic()
                    self.store.transcript(
                        session_id, event.get("role", "unknown"), event.get("content", "")
                    )
                    logging.getLogger("YOU" if event.get("role") == "user" else "BUDDY").info(
                        "%s", event.get("content", "")
                    )
                elif kind == "AgentAudioDone":
                    audio_active = False
                    if end_requested:
                        await mark_end()
                elif kind == "FunctionCallRequest":
                    for function in event.get("functions", []):
                        if function.get("client_side") is False:
                            continue
                        result = self.checkin.execute(
                            session_id,
                            function.get("id", ""),
                            function.get("name", ""),
                            function.get("arguments", function.get("input", "{}")),
                        )
                        response = {
                            "type": "FunctionCallResponse",
                            "id": function.get("id"),
                            "name": function.get("name"),
                            "content": json.dumps(result, ensure_ascii=False),
                        }
                        if "thought_signature" in function:
                            response["thought_signature"] = function["thought_signature"]
                        await agent.send(json.dumps(response))
                        self.sync.wake.set()
                        if result.get("ok") and function.get("name") in {
                            "record_answer",
                            "complete_checkin",
                        }:
                            logging.getLogger("SAVE").info(
                                "Answer saved locally | next: %s | Sheets: %s",
                                result.get("next_section") or "complete",
                                result.get("sheets_status"),
                            )
                        elif not result.get("ok"):
                            logging.getLogger("SAVE").warning(
                                "Answer needs attention | %s", result.get("error", "Tool failed")
                            )
                        if result.get("end_call"):
                            end_requested = True
                            end_requested_at = time.monotonic()
                elif kind == "Error":
                    logger.warning(
                        "Deepgram rejected the voice session (%s)", event.get("code", "unknown")
                    )
                    raise ValueError("Deepgram voice session rejected")
            finished.set()

        async def from_twilio() -> None:
            while not finished.is_set():
                event = json.loads(await twilio.receive_text())
                kind = event.get("event")
                if kind == "media":
                    await asyncio.wait_for(settings_ready.wait(), timeout=20)
                    media = event.get("media", {})
                    if media.get("track", "inbound") == "inbound":
                        payload = base64.b64decode(media["payload"], validate=True)
                        if len(payload) > 16000:
                            raise ValueError("Oversized media frame")
                        await agent.send(payload)
                elif (
                    kind == "mark"
                    and final_mark
                    and event.get("mark", {}).get("name") == final_mark
                ):
                    finished.set()
                elif kind == "stop":
                    finished.set()

        async def supervise() -> None:
            while not finished.is_set():
                try:
                    await asyncio.wait_for(finished.wait(), timeout=1)
                except TimeoutError:
                    now = time.monotonic()
                    if end_requested and not audio_active and now - end_requested_at >= 2:
                        await mark_end()
                    if end_requested and now - end_requested_at >= 15:
                        finished.set()
                    if now - last_activity > self.settings.silence_timeout_seconds:
                        raise TimeoutError("No conversation activity")

        async def keep_alive() -> None:
            while not finished.is_set():
                await asyncio.sleep(5)
                await agent.send(json.dumps({"type": "KeepAlive"}))

        tasks = [
            asyncio.create_task(coro()) for coro in (from_agent, from_twilio, supervise, keep_alive)
        ]
        tasks.append(asyncio.create_task(finished.wait()))
        try:
            async with asyncio.timeout(self.settings.max_call_seconds):
                done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    task.result()
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
