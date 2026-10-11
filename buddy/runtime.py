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

    async def close(self) -> None:
        active = self.active_call()
        if active and active["call_sid"]:
            try:
                await self.hangup()
            except IntegrationError:
                logger.warning("Could not confirm call termination. Check the call in Twilio.")
        if self.worker:
            self.worker.cancel()
            await asyncio.gather(self.worker, return_exceptions=True)
        await self.http.aclose()

    def new_session(self) -> dict:
        return self.store.create(datetime.now(ZoneInfo(self.settings.timezone)).date().isoformat())

    async def start_call(self, session_id: str | None = None) -> dict:
        missing = self.settings.missing_call_settings()
        if missing:
            raise IntegrationError(
                "Missing or invalid settings: "
                + ", ".join(missing)
                + ". Run uv run python setup.py."
            )
        async with self.call_lock:
            if self.active_call():
                raise IntegrationError(
                    "A call is already active. Use hangup before starting another."
                )
            session = self.store.get(session_id) if session_id else self.new_session()
            if session["status"] in {"completed", "declined"}:
                raise IntegrationError("This check-in is closed. Use call to start a new check-in.")
            self.store.update(
                session["id"],
                call_status="starting",
