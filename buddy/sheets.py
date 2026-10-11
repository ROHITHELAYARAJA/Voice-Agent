import asyncio
import json
import logging
import time
from urllib.parse import quote

import httpx

from buddy.models import totals
from buddy.storage import Store
from config import Settings

logger = logging.getLogger("SHEETS")
HEADERS = [
    "Check-in ID",
    "Date",
    "Status",
    "Accomplishments",
    "Learning",
    "Spending notes",
    "Spending totals",
    "Expenses",
    "Income notes",
    "Income totals",
    "Income entries",
    "Wellbeing",
    "Tomorrow",
    "Notes",
    "Skipped sections",
    "Timezone",
    "Updated at",
    "Call status",
]


class IntegrationError(Exception):
    pass


def checkin_row(session: dict, timezone: str) -> list:
    answers = session["answers"]

    def answer(section: str) -> str:
        saved = answers.get(section, {})
        text = saved.get("answer", "")
        if (
            section in {"spending", "income"}
            and not saved.get("skipped")
            and not saved.get("details_complete", True)
        ):
            text += " | Details incomplete; totals include confirmed exact amounts only."
        return text

    return [
        session["id"],
        session["checkin_date"],
        session["status"],
        answer("accomplishments"),
        answer("learning"),
        answer("spending"),
        json.dumps(totals(session["expenses"])),
        json.dumps(session["expenses"], ensure_ascii=False),
        answer("income"),
        json.dumps(totals(session["income"])),
        json.dumps(session["income"], ensure_ascii=False),
        answer("wellbeing"),
        answer("tomorrow"),
        answer("notes"),
        ", ".join(key for key, value in answers.items() if value.get("skipped")),
        timezone,
        session["updated_at"],
        session["call_status"],
    ]



class SheetsClient:
    label = "Google Sheet"

    def __init__(self, settings: Settings, http: httpx.AsyncClient):
        self.settings = settings
        self.http = http
        self.credentials = None
        self.initialized = False

    @property
    def configured(self) -> bool:
        return not self.settings.missing_google_settings()
        self.settings = settings
        self.http = http
        self.credentials = None
        self.initialized = False

    @property
    def target(self) -> str:
        return f"{self.settings.google_sheet_id}:{self.settings.google_sheet_tab}"

    @property
    def base_url(self) -> str:
        return f"https://sheets.googleapis.com/v4/spreadsheets/{self.settings.google_sheet_id}"

    def refresh_credentials(self) -> str:
                
        if self.credentials is None:
            self.credentials, _ = google.auth.load_credentials_from_file(
                str(self.settings.credentials_path),
                scopes=["https://www.googleapis.com/auth/spreadsheets"],
            )
        if not self.credentials.valid:
            self.credentials.refresh(Request())
        return self.credentials.token

    async def request(self, method: str, suffix: str = "", **kwargs) -> dict:
        try:
            token = await asyncio.to_thread(self.refresh_credentials)
        except Exception:
            raise IntegrationError(
                "Google authentication failed. Check the credentials file and Sheets permission."
            ) from None
        try:
            response = await self.http.request(
                method,
                self.base_url + suffix,
                headers={"Authorization": f"Bearer {token}"},
                **kwargs,
            )
        except httpx.HTTPError:
            raise IntegrationError(
                "Google Sheets could not be reached. Your answers remain saved locally."
            ) from None
        if response.status_code >= 400:
            messages = {
                401: "Google credentials were rejected.",
                403: "Google denied access. Enable the Sheets API and share the spreadsheet with your service account as Editor.",
                404: "Spreadsheet not found. Check GOOGLE_SHEET_ID and access.",
                429: "Google Sheets rate limit reached. Sync will retry.",
            }
            raise IntegrationError(
                messages.get(
                    response.status_code,
                    f"Google Sheets returned HTTP {response.status_code}. Sync will retry.",
                )
            )
        return response.json()

    def value_path(self, cells: str) -> str:
        title = self.settings.google_sheet_tab.replace("'", "''")
        return "/values/" + quote(f"'{title}'!{cells}", safe="")

    async def initialize(self) -> None:
        if self.initialized:
            return
        metadata = await self.request("GET", params={"fields": "sheets.properties"})
        properties = next(
            (
                sheet["properties"]
                for sheet in metadata.get("sheets", [])
                if sheet["properties"]["title"] == self.settings.google_sheet_tab
            ),
            None,
        )
        if properties is None:
            created = await self.request(
                "POST",
                ":batchUpdate",
                json={
                    "requests": [
                        {
                            "addSheet": {
                                "properties": {
                                    "title": self.settings.google_sheet_tab,
                                    "gridProperties": {
                                        "rowCount": 1000,
                                        "columnCount": len(HEADERS),
                                        "frozenRowCount": 1,
                                    },
                                }
                            }
                        }
                    ]
                },
            )
            properties = created["replies"][0]["addSheet"]["properties"]
        header = await self.request("GET", self.value_path("A1:R1"))
        values = header.get("values", [])
        if values and values[0] != HEADERS:
            raise IntegrationError(
                "The target tab has a different header. Choose a new GOOGLE_SHEET_TAB to protect existing data."
            )
        if not values:
            existing = await self.request("GET", self.value_path("A2:R"))
            if existing.get("values"):
                raise IntegrationError(
                    "The target tab contains data without a Buddy header. Choose an empty tab."
                )
            await self.request(
                "PUT",
                self.value_path("A1:R1"),
                params={"valueInputOption": "RAW"},
                json={"values": [HEADERS]},
            )
            await self.request(
                "POST",
                ":batchUpdate",
                json={
                    "requests": [
                        {
                            "repeatCell": {
                                "range": {
                                    "sheetId": properties["sheetId"],
                                    "startRowIndex": 0,
                                    "endRowIndex": 1,
                                },
                                "cell": {
                                    "userEnteredFormat": {
                                        "textFormat": {"bold": True},
                                        "backgroundColor": {
                                            "red": 0.12,
                                            "green": 0.2,
                                            "blue": 0.18,
                                        },
                                    }
                                },
                                "fields": "userEnteredFormat",
                            }
                        },
                        {
                            "updateSheetProperties": {
                                "properties": {
                                    "sheetId": properties["sheetId"],
                                    "gridProperties": {"frozenRowCount": 1},
                                },
                                "fields": "gridProperties.frozenRowCount",
                            }
                        },
                    ]
                },
            )
        self.initialized = True

    async def write(self, store: Store, session: dict) -> None:
        await self.initialize()
        column = await self.request("GET", self.value_path("A:A"))
        ids = column.get("values", [])
        row_number = store.reserve_row(self.target, session["id"], max(2, len(ids) + 1))
        if (
            row_number <= len(ids)
            and ids[row_number - 1]
            and ids[row_number - 1][0] != session["id"]
        ):
            raise IntegrationError(
                "The reserved sheet row was moved or edited. Restore the tab's original row order before syncing."
            )
        matches = [index + 1 for index, row in enumerate(ids) if row and row[0] == session["id"]]
        if matches and matches != [row_number]:
            raise IntegrationError(
                "The check-in row was moved or duplicated in Sheets. Restore the original row order before syncing."
            )
        metadata = await self.request("GET", params={"fields": "sheets.properties"})
        properties = next(
            sheet["properties"]
            for sheet in metadata["sheets"]
            if sheet["properties"]["title"] == self.settings.google_sheet_tab
        )
        if row_number > properties["gridProperties"]["rowCount"]:
            await self.request(
                "POST",
                ":batchUpdate",
                json={
                    "requests": [
                        {
                            "appendDimension": {
                                "sheetId": properties["sheetId"],
                                "dimension": "ROWS",
                                "length": max(
                                    1000, row_number - properties["gridProperties"]["rowCount"]
                                ),
                            }
                        }
                    ]
                },
            )
        answers = session["answers"]

        def answer(section: str) -> str:
            return answers.get(section, {}).get("answer", "")

        row = [
            session["id"],
            session["checkin_date"],
            session["status"],
            answer("accomplishments"),
            answer("learning"),
            answer("spending"),
            json.dumps(totals(session["expenses"])),
            json.dumps(session["expenses"], ensure_ascii=False),
            answer("income"),
            json.dumps(totals(session["income"])),
            json.dumps(session["income"], ensure_ascii=False),
            answer("wellbeing"),
            answer("tomorrow"),
            answer("notes"),
            ", ".join(key for key, value in answers.items() if value.get("skipped")),
            self.settings.timezone,
            session["updated_at"],
            session["call_status"],
        ]
        await self.request(
            "PUT",
            self.value_path(f"A{row_number}:R{row_number}"),
            params={"valueInputOption": "RAW"},
            json={"values": [row]},
        )


class SheetsSync:
    def __init__(self, store: Store, client: SheetsClient):
        self.store = store
        self.client = client
        self.lock = asyncio.Lock()
        self.wake = asyncio.Event()
        self.last_error: str | None = None

    async def flush(self) -> dict:
        if self.client.settings.missing_sheet_settings():
            return {"synced": 0, "configured": False}
        synced = 0
        async with self.lock:
            for session in self.store.pending(self.client.target, time.time()):
                try:
                    await self.client.write(self.store, session)
                    self.store.mark_synced(self.client.target, session["id"], session["version"])
                    logger.info(
                        "Google Sheet updated | check-in %s | revision %s",
                        session["id"],
                        session["version"],
                    )
                    self.last_error = None
                    synced += 1
                except IntegrationError as exc:
                    self.last_error = str(exc)
                    self.store.mark_sync_error(session["id"], self.last_error, time.time())
                    logger.warning("Sheets sync pending: %s", self.last_error)
                except Exception:
                    self.last_error = "Sheets sync failed. Your answers remain saved locally; inspect the configuration."
                    self.store.mark_sync_error(session["id"], self.last_error, time.time())
                    logger.warning("Sheets sync pending after an unexpected failure")
        return {"synced": synced, "configured": True, "error": self.last_error}

    async def run(self) -> None:
        while True:
            self.wake.clear()
            await self.flush()
            try:
                await asyncio.wait_for(self.wake.wait(), timeout=10)
            except TimeoutError:
                continue
