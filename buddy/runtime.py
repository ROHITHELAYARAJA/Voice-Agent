import asyncio
import logging
import secrets
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from buddy.bridge import VoiceBridge
from buddy.checkin import CheckinService
from buddy.sheets import IntegrationError, SheetsClient, SheetsSync
from buddy.storage import Store
from buddy.telephony import TwilioClient
from config import Settings

logger = logging.getLogger("TWILIO")


class BuddyRuntime:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.store = Store(settings.data_dir / "buddy.sqlite3")
        self.checkin = CheckinService(
            self.store, f"{settings.google_sheet_id}:{settings.google_sheet_tab}"
        )
        self.http = httpx.AsyncClient(timeout=20)
        self.sheets = SheetsSync(self.store, SheetsClient(settings, self.http))
        self.telephony = TwilioClient(settings, self.http)
        self.bridge = VoiceBridge(settings, self.store, self.checkin, self.sheets)
        self.call_lock = asyncio.Lock()
        self.worker = None

    async def start(self) -> None:
        self.store.recover_calls()
        self.worker = asyncio.create_task(self.sheets.run())
