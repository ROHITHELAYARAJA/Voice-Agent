import asyncio
import json
import logging
import time
from urllib.parse import quote

import google.auth
import httpx
from google.auth.transport.requests import Request

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


class SheetsClient:
    def __init__(self, settings: Settings, http: httpx.AsyncClient):
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
