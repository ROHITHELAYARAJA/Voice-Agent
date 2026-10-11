import asyncio
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from buddy.storage import Store
from config import Settings

LOG_HEADERS = ["Log ID", "Check-in ID", "Timestamp", "Speaker", "Message"]
CHECKINS_TAB = "Buddy Checkins"
LOG_TAB = "Conversation Log"

class ExcelClient:
    label = "Excel file"
    configured = True

    def __init__(self, settings: Settings):
        self.settings = settings
        self.path = settings.excel_path.resolve()

    @property
    def target(self) -> str:
        return f"excel:{self.path}"
