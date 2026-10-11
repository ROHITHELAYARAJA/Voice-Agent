# Buddy: terminal daily check-in calls

Buddy calls your configured phone number, asks about your day one question at a time, and saves each answer locally before syncing it to Google Sheets. Everything runs from the terminal: no UI and no browser dashboard.

The configured pipeline is **Twilio Voice → ngrok → FastAPI → Deepgram Flux → Gemini 3.8 Flash → ElevenLabs Jessica**. The live Deepgram model catalog was checked on October 11, 2026 and included `gemini-3.8-flash`. Jessica uses voice ID `cgSgspJ2msm6clMCkdW9` through ElevenLabs' authenticated streaming endpoint and `eleven_turbo_v2_5`.

## Start

Open PowerShell in this project's actual directory:

```powershell
Set-Location -LiteralPath 'C:\Users\erohi\OneDrive\Desktop\Voice-Agent'
uv sync
uv run python setup.py
uv run python run.py --doctor --live-check
uv run python run.py --call
```

Setup keeps existing `.env` values when you press Enter. Secret input is hidden. Your existing ngrok and Deepgram keys stay in place. Never replace `.env` with the example if you already have keys saved.

`run.py` starts the local bridge and ngrok together, uses the actual tunnel URL for Twilio callbacks, and calls your number when `--call` is supplied. It stays running for further terminal commands. Without `--call`, it starts the connections and waits for your commands. Calls are manual; no schedule runs in the background.

## Required configuration

| Variable | What to provide |
| --- | --- |
| `NGROK_AUTHTOKEN` | Your ngrok token |
| `DEEPGRAM_API_KEY` | A Deepgram key with Voice Agent access |
| `TWILIO_ACCOUNT_SID` | Your Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Your Twilio auth token, also used to validate callbacks |
| `TWILIO_PHONE_NUMBER` | A voice-capable Twilio number in international format |
| `OWNER_PHONE_NUMBER` | Your own number, including `+` and country code |
| `ELEVENLABS_API_KEY` | An ElevenLabs key with TTS permission and access to Jessica |
| `GOOGLE_SHEET_ID` | The spreadsheet ID between `/d/` and `/edit` in its URL |
| `GOOGLE_CREDENTIALS_FILE` | Path to a Google service account JSON file |

Keep your Google JSON in the ignored `credentials` directory. Enable the Google Sheets API in that Google Cloud project. Share the spreadsheet with the JSON file's `client_email` as Editor. Buddy creates a dedicated `Buddy Checkins` tab if it does not exist and refuses to overwrite a tab with unrelated headers or data.

Defaults: English, `Asia/Kolkata`, INR, your name Rohith, a 15-minute call limit and a 120-second conversation silence limit. Change them in `.env`. `.env.example` lists all available settings. Jessica availability depends on your ElevenLabs account; the live diagnostic checks the configured voice instead of silently choosing another one.

