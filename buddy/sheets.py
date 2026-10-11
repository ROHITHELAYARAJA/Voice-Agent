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
