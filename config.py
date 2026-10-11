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
    google_sheet_tab: str = "Buddy Checkins"
    timezone: str = "Asia/Kolkata"
    currency: str = "INR"
    port: int = 8000
    data_dir: Path = ROOT / "data"
    llm_provider: str = "google"
    llm_model: str = "gemini-3.8-flash"
    tts_provider: str = "eleven_labs"
    tts_model: str = "eleven_turbo_v2_5"
    tts_voice: str = "cgSgspJ2msm6clMCkdW9"
    max_call_seconds: int = 900
    silence_timeout_seconds: int = 120

    @classmethod
    def from_env(cls) -> "Settings":
        names = {
            "deepgram_api_key": "DEEPGRAM_API_KEY",
            "elevenlabs_api_key": "ELEVENLABS_API_KEY",
            "public_hostname": "PUBLIC_HOSTNAME",
            "twilio_account_sid": "TWILIO_ACCOUNT_SID",
            "twilio_auth_token": "TWILIO_AUTH_TOKEN",
            "twilio_phone_number": "TWILIO_PHONE_NUMBER",
            "owner_phone_number": "OWNER_PHONE_NUMBER",
            "owner_name": "OWNER_NAME",
            "google_sheet_id": "GOOGLE_SHEET_ID",
            "google_credentials_file": "GOOGLE_CREDENTIALS_FILE",
            "google_sheet_tab": "GOOGLE_SHEET_TAB",
            "timezone": "TIMEZONE",
            "currency": "CURRENCY",
            "llm_provider": "LLM_PROVIDER",
            "llm_model": "LLM_MODEL",
            "tts_provider": "TTS_PROVIDER",
            "tts_model": "TTS_MODEL",
            "tts_voice": "TTS_VOICE_ID",
        }
        values = {
            field: os.environ[name].strip() for field, name in names.items() if name in os.environ
        }
        for field_name in ("port", "max_call_seconds", "silence_timeout_seconds"):
            if field_name.upper() in os.environ:
                values[field_name] = int(os.environ[field_name.upper()])
        if os.getenv("DATA_DIR"):
            values["data_dir"] = Path(os.environ["DATA_DIR"]).expanduser().resolve()
        settings = cls(**values)
        ZoneInfo(settings.timezone)
        if not 1 <= settings.port <= 65535:
            raise ValueError("PORT must be between 1 and 65535")
        if not 60 <= settings.max_call_seconds <= 3600:
            raise ValueError("MAX_CALL_SECONDS must be between 60 and 3600")
        if not 30 <= settings.silence_timeout_seconds <= 600:
