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
