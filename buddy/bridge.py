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
