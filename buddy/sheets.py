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
