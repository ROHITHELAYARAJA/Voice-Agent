import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")


@dataclass
class Settings:
    deepgram_api_key: str = field(default="", repr=False)
    elevenlabs_api_key: str = field(default="", repr=False)
    public_hostname: str = ""
    twilio_account_sid: str = ""
    twilio_auth_token: str = field(default="", repr=False)
    twilio_phone_number: str = ""
    owner_phone_number: str = ""
    owner_name: str = "Rohith"
    google_sheet_id: str = ""
    google_credentials_file: str = ""
