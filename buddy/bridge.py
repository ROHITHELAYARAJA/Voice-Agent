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
