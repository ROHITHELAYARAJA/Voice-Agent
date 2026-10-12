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
    call_mode: str = "gather"
    stream_stt_provider: str = "deepgram"
    conversation_language: str = "en"
    phone_speech_model: str = "default"
    whisper_model: str = "small"
    whisper_device: str = "auto"
    gather_ai_provider: str = "local"
    phone_voice_provider: str = "twilio"
    local_model: str = "qwen3:1.7b"
    local_ai_url: str = "http://127.0.0.1:11434"
    local_ai_timeout: float = 3.5
    phone_voice: str = "Polly.Aditi"
    phone_language: str = "en-IN"
    phone_speech_timeout: int = 1
    gather_max_turns: int = 10
    sheet_backend: str = "excel"
    excel_file: str = ""
    google_sheet_id: str = ""
    google_credentials_file: str = ""
    google_sheet_tab: str = "Buddy Checkins"
    timezone: str = "Asia/Kolkata"
    currency: str = "INR"
    port: int = 8000
    data_dir: Path = ROOT / "data"
    llm_provider: str = "open_ai"
    llm_model: str = "gpt-4.1-mini"
    tts_provider: str = "eleven_labs"
    tts_model: str = "eleven_turbo_v2_5"
    tts_connection: str = "managed"
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
            "call_mode": "CALL_MODE",
            "stream_stt_provider": "STREAM_STT_PROVIDER",
            "conversation_language": "CONVERSATION_LANGUAGE",
            "phone_speech_model": "PHONE_SPEECH_MODEL",
            "whisper_model": "WHISPER_MODEL",
            "whisper_device": "WHISPER_DEVICE",
            "gather_ai_provider": "GATHER_AI_PROVIDER",
            "phone_voice_provider": "PHONE_VOICE_PROVIDER",
            "local_model": "LOCAL_MODEL",
            "local_ai_url": "LOCAL_AI_URL",
            "phone_voice": "PHONE_VOICE",
            "phone_language": "PHONE_LANGUAGE",
            "sheet_backend": "SHEET_BACKEND",
            "excel_file": "EXCEL_FILE",
            "google_sheet_id": "GOOGLE_SHEET_ID",
            "google_credentials_file": "GOOGLE_CREDENTIALS_FILE",
            "google_sheet_tab": "GOOGLE_SHEET_TAB",
            "timezone": "TIMEZONE",
            "currency": "CURRENCY",
            "llm_provider": "LLM_PROVIDER",
            "llm_model": "LLM_MODEL",
            "tts_provider": "TTS_PROVIDER",
            "tts_model": "TTS_MODEL",
            "tts_connection": "TTS_CONNECTION",
            "tts_voice": "TTS_VOICE_ID",
        }
        values = {
            field: os.environ[name].strip() for field, name in names.items() if name in os.environ
        }
        for field_name in (
            "port",
            "max_call_seconds",
            "silence_timeout_seconds",
            "phone_speech_timeout",
        ):
            if field_name.upper() in os.environ:
                values[field_name] = int(os.environ[field_name.upper()])
        if os.getenv("DATA_DIR"):
            values["data_dir"] = Path(os.environ["DATA_DIR"]).expanduser().resolve()
        settings = cls(**values)
        if settings.call_mode not in {"gather", "stream"}:
            raise ValueError("CALL_MODE must be gather or stream")
        if settings.stream_stt_provider not in {"deepgram", "whisper"}:
            raise ValueError("STREAM_STT_PROVIDER must be deepgram or whisper")
        if settings.conversation_language not in {"en", "ta"}:
            raise ValueError("CONVERSATION_LANGUAGE must be en or ta")
        if settings.whisper_model not in {"tiny", "base", "small", "medium", "turbo", "large-v3"}:
            raise ValueError("WHISPER_MODEL must be a multilingual Whisper model")
        if settings.whisper_device not in {"auto", "cpu", "cuda"}:
            raise ValueError("WHISPER_DEVICE must be auto, cpu or cuda")
        if settings.gather_ai_provider not in {"local", "deepgram"}:
            raise ValueError("GATHER_AI_PROVIDER must be local or deepgram")
        if settings.phone_voice_provider not in {"twilio", "eleven_labs"}:
            raise ValueError("PHONE_VOICE_PROVIDER must be twilio or eleven_labs")
        if settings.tts_connection not in {"managed", "byo"}:
            raise ValueError("TTS_CONNECTION must be managed or byo")
        if ":cloud" in settings.local_model or not settings.local_model.strip():
            raise ValueError("LOCAL_MODEL must name a downloaded local model")
        local_url = urlparse(settings.local_ai_url)
        if (
            local_url.scheme != "http"
            or local_url.hostname not in {"127.0.0.1", "localhost", "::1"}
            or local_url.username
            or local_url.password
            or local_url.path
            or local_url.query
            or local_url.fragment
        ):
            raise ValueError("LOCAL_AI_URL must be a loopback HTTP address")
        if settings.sheet_backend not in {"excel", "google"}:
            raise ValueError("SHEET_BACKEND must be excel or google")
        if settings.excel_path.suffix.lower() != ".xlsx":
            raise ValueError("EXCEL_FILE must end with .xlsx")
        ZoneInfo(settings.timezone)
        if not 1 <= settings.port <= 65535:
            raise ValueError("PORT must be between 1 and 65535")
        if not 60 <= settings.max_call_seconds <= 3600:
            raise ValueError("MAX_CALL_SECONDS must be between 60 and 3600")
        if not 30 <= settings.silence_timeout_seconds <= 600:
            raise ValueError("SILENCE_TIMEOUT_SECONDS must be between 30 and 600")
        if not 1 <= settings.phone_speech_timeout <= 5:
            raise ValueError("PHONE_SPEECH_TIMEOUT must be between 1 and 5 seconds")
        if not re.fullmatch(r"[A-Z]{3}", settings.currency):
            raise ValueError("CURRENCY must be a three-letter uppercase code")
        if not settings.google_sheet_tab or any(c in settings.google_sheet_tab for c in "[]:*?/\\"):
            raise ValueError("GOOGLE_SHEET_TAB must be a valid sheet title")
        return settings

    @property
    def public_url(self) -> str:
        value = self.public_hostname.strip().rstrip("/")
        if not value:
            return ""
        parsed = urlparse(value if "://" in value else f"https://{value}")
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            return ""
        if (
            parsed.path
            or parsed.query
            or parsed.fragment
            or parsed.hostname in {"localhost", "127.0.0.1"}
        ):
            return ""
        return f"https://{parsed.netloc}"

    @property
    def excel_path(self) -> Path:
        if not self.excel_file:
            return self.data_dir / "Buddy Daily Check-ins.xlsx"
        path = Path(self.excel_file).expanduser()
        return path if path.is_absolute() else ROOT / path

    @property
    def credentials_path(self) -> Path | None:
        if not self.google_credentials_file:
            return None
        path = Path(self.google_credentials_file).expanduser()
        return path if path.is_absolute() else ROOT / path

    def missing_call_settings(self) -> list[str]:
        missing = []
        for name in ("twilio_account_sid", "twilio_auth_token"):
            if not getattr(self, name):
                missing.append(name.upper())
        if (
            self.call_mode == "stream"
            or self.gather_ai_provider == "deepgram"
            or self.phone_voice_provider == "eleven_labs"
        ):
            if not self.deepgram_api_key:
                missing.append("DEEPGRAM_API_KEY")
        if (
            self.call_mode == "stream" and self.tts_provider == "eleven_labs"
        ) or self.phone_voice_provider == "eleven_labs":
            if self.tts_connection == "byo" and not self.elevenlabs_api_key:
                missing.append("ELEVENLABS_API_KEY")
        for name in ("twilio_phone_number", "owner_phone_number"):
            if not re.fullmatch(r"\+[1-9]\d{7,14}", getattr(self, name)):
                missing.append(name.upper())
        if not self.public_url:
            missing.append("PUBLIC_HOSTNAME")
        if self.twilio_account_sid and not re.fullmatch(
            r"AC[a-fA-F0-9]{32}", self.twilio_account_sid
        ):
            missing.append("TWILIO_ACCOUNT_SID (invalid format)")
        return missing

    def missing_sheet_settings(self) -> list[str]:
        return [] if self.sheet_backend == "excel" else self.missing_google_settings()

    def missing_google_settings(self) -> list[str]:
        missing = []
        if not re.fullmatch(r"[\w-]+", self.google_sheet_id):
            missing.append("GOOGLE_SHEET_ID")
        if not self.credentials_path or not self.credentials_path.is_file():
            missing.append("GOOGLE_CREDENTIALS_FILE")
        return missing
