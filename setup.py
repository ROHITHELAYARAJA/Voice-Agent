import getpass
import os

from dotenv import dotenv_values, set_key

from config import ROOT

FIELDS = [
    ("DEEPGRAM_API_KEY", "Deepgram API key", True),
    ("NGROK_AUTHTOKEN", "ngrok auth token", True),
    ("TWILIO_ACCOUNT_SID", "Twilio account SID", False),
    ("TWILIO_AUTH_TOKEN", "Twilio auth token", True),
    ("TWILIO_PHONE_NUMBER", "Your Twilio calling number in +countrycode format", False),
    ("OWNER_PHONE_NUMBER", "Your own phone number in +countrycode format", False),
    ("ELEVENLABS_API_KEY", "ElevenLabs API key with access to Jessica", True),
    ("GOOGLE_SHEET_ID", "Spreadsheet ID from its URL, between /d/ and /edit", False),
    ("GOOGLE_CREDENTIALS_FILE", "Google service account JSON file path", False),
    ("OWNER_NAME", "Your preferred name", False),
]


def main() -> None:
    path = ROOT / ".env"
    path.touch(exist_ok=True)
    values = dotenv_values(path)
    print("Buddy terminal setup. Enter keeps a saved value. Secret values never display.")
    print(
        "Google Sheets: enable its API and share the spreadsheet with the service account as Editor."
    )
    print("Keep your credential JSON inside the git-ignored credentials folder.")
    for key, label, secret in FIELDS:
        existing = values.get(key) or os.getenv(key)
        prompt = f"{label} [{'configured' if existing else 'missing'}]: "
        value = (getpass.getpass(prompt) if secret else input(prompt)).strip()
        if value:
            set_key(path, key, value)
    for key, default in {
        "LLM_PROVIDER": "google",
        "LLM_MODEL": "gemini-3.8-flash",
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
    print("Start and call yourself: uv run python run.py --call")


if __name__ == "__main__":
    try:
