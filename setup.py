import getpass
import os

from dotenv import dotenv_values, set_key

from config import ROOT

FIELDS = [
    ("NGROK_AUTHTOKEN", "ngrok auth token", True),
    ("TWILIO_ACCOUNT_SID", "Twilio account SID", False),
    ("TWILIO_AUTH_TOKEN", "Twilio auth token", True),
    ("TWILIO_PHONE_NUMBER", "Your Twilio calling number in +countrycode format", False),
    ("OWNER_PHONE_NUMBER", "Your own phone number in +countrycode format", False),
    ("DEEPGRAM_API_KEY", "Deepgram Voice Agent API key", True),
    ("EXCEL_FILE", "Optional Excel file path (Enter uses data/Buddy Daily Check-ins.xlsx)", False),
    ("OWNER_NAME", "Your preferred name", False),
]


def main() -> None:
    path = ROOT / ".env"
    path.touch(exist_ok=True)
    values = dotenv_values(path)
    print("Buddy terminal setup. Enter keeps a saved value. Secret values never display.")
    print("Daily answers and conversation logs save to local Excel. No Google account is needed.")
    for key, label, secret in FIELDS:
        existing = values.get(key) or os.getenv(key)
        prompt = f"{label} [{'configured' if existing else 'missing'}]: "
        value = (getpass.getpass(prompt) if secret else input(prompt)).strip()
        if value:
            set_key(path, key, value)
    for key, default in {
        "CALL_MODE": "gather",
        "GATHER_AI_PROVIDER": "deepgram",
        "PHONE_VOICE_PROVIDER": "eleven_labs",
        "TTS_CONNECTION": "managed",
        "LOCAL_MODEL": "qwen3:1.7b",
        "LOCAL_AI_URL": "http://127.0.0.1:11434",
        "PHONE_VOICE": "Polly.Aditi",
        "PHONE_LANGUAGE": "ta-IN",
        "CONVERSATION_LANGUAGE": "ta",
        "PHONE_SPEECH_MODEL": "googlev2_chirp_3",
        "STREAM_STT_PROVIDER": "whisper",
        "WHISPER_MODEL": "small",
        "WHISPER_DEVICE": "auto",
        "PHONE_SPEECH_TIMEOUT": "1",
        "SHEET_BACKEND": "excel",
        "LLM_PROVIDER": "open_ai",
        "LLM_MODEL": "gpt-4.1-mini",
        "TTS_PROVIDER": "eleven_labs",
        "TTS_MODEL": "eleven_turbo_v2_5",
        "TTS_VOICE_ID": "cgSgspJ2msm6clMCkdW9",
        "OWNER_NAME": "Rohith",
        "TIMEZONE": "Asia/Kolkata",
        "CURRENCY": "INR",
        "GOOGLE_SHEET_TAB": "Buddy Checkins",
    }.items():
        if not dotenv_values(path).get(key):
            set_key(path, key, default)
    print("Settings saved locally. Run: uv run python run.py --doctor --live-check")
    print("Deepgram provides GPT-4.1 Mini and Jessica using your project credits.")
    print("Start and call yourself: uv run python run.py --call")


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print("\nSetup stopped. Any values already entered remain saved.")
