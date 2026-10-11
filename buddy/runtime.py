import asyncio
import logging
import secrets
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from buddy.bridge import VoiceBridge
from buddy.checkin import CheckinService
from buddy.excel import ExcelClient
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
        client = (
            ExcelClient(settings)
            if settings.sheet_backend == "excel"
            else SheetsClient(settings, self.http)
        )
        self.checkin = CheckinService(self.store, client.target, settings.sheet_backend)
        self.sheets = SheetsSync(self.store, client)
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
                call_error=None,
                stream_token=secrets.token_urlsafe(32),
            )
            logger.info("Requesting a call to your configured number | check-in %s", session["id"])
            try:
                result = await self.telephony.call_owner(session["id"])
                current = self.store.get(session["id"])
                changes = {"call_sid": result["sid"]}
                if current["call_status"] == "starting":
                    changes["call_status"] = result.get("status", "queued")
                self.store.update(session["id"], **changes)
            except IntegrationError as exc:
                self.store.update(session["id"], call_status="failed", call_error=str(exc))
                logger.error("%s", exc)
                raise
            self.sheets.wake.set()
            logger.info(
                "Call accepted | %s | %s",
                result["sid"],
                self.store.get(session["id"])["call_status"],
            )
            return self.store.get(session["id"])

    def active_call(self) -> dict | None:
        return next(
            (
                session
                for session in self.store.list_sessions(1000)
                if session["call_status"]
                in {"starting", "queued", "initiated", "ringing", "in-progress"}
            ),
            None,
        )

    async def hangup(self) -> None:
        session = self.active_call()
        if not session or not session["call_sid"]:
            raise IntegrationError("No active call is available to end.")
        await self.telephony.hangup(session["call_sid"])
        changes = {"call_status": "completed"}
        if session["status"] not in {"completed", "declined"}:
            changes["status"] = "interrupted"
        self.store.update(session["id"], **changes)
        self.sheets.wake.set()
        logger.info("Call ended. Every saved answer is retained.")

    def callback(self, session_id: str, form) -> None:
        session = self.store.get(session_id)
        sid = form.get("CallSid")
        if session["call_sid"] != sid:
            if (
                session["call_status"] != "starting"
                or session["call_sid"] is not None
                or form.get("To") != self.settings.owner_phone_number
            ):
                raise ValueError("Call mismatch")
            self.store.update(session_id, call_sid=sid)
        value = form.get("CallStatus", "")
        active = {"starting": 0, "queued": 1, "initiated": 1, "ringing": 2, "in-progress": 3}
        terminal = {"completed", "busy", "failed", "no-answer", "canceled", "interrupted"}
        if value not in active and value not in terminal:
            raise ValueError("Unknown call status")
        if session["call_status"] in terminal or (
            value in active and active[value] < active.get(session["call_status"], 0)
        ):
            return
        changes = {"call_status": value}
        if value in terminal and session["status"] not in {"completed", "declined"}:
            changes["status"] = "interrupted"
        self.store.update(session_id, **changes)
        self.sheets.wake.set()
        logger.info("Call %s | %s", sid, value)
