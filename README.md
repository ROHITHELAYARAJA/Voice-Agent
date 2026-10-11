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

Twilio accounts on a trial may require your destination number to be verified. Enable calling to your destination country in Twilio's geographic permissions. A call error reports its Twilio error code. Calls and provider usage are billed by your provider accounts.

## Terminal commands

| Command | Behavior |
| --- | --- |
| `call` | Start a new daily check-in call to your configured number |
| `resume <check-in-id>` | Call again and continue an unfinished saved check-in |
| `hangup` | End the active call while retaining saved answers |
| `status` | Show configuration readiness and the active call |
| `list` | Show the 20 most recent check-ins with IDs and sync status |
| `show <check-in-id>` | Show its answers, money entries, totals and next question |
| `sync` | Retry pending Google Sheets updates |
| `help` | Show commands |
| `quit` | Stop the bridge, close ngrok and end any known active call |

Use the actual check-in ID printed in the logs with `resume` or `show`. A new call creates a new check-in; resuming updates the existing record. Multiple calls on a day are separate records, so avoid repeating the same transactions in a new check-in.

Optional launch modes:

```powershell
uv run python run.py
uv run python run.py --call --non-interactive
uv run python run.py --no-tunnel
```

`--non-interactive` shows logs with no command prompt; stop with Ctrl+C. `--no-tunnel` uses an existing tunnel or deployment specified by `PUBLIC_HOSTNAME`. `--domain` accepts your reserved ngrok domain. Outbound calls supply their own webhook URLs, so they require no Twilio Console webhook edit. For inbound calls, set your Twilio number's Voice webhook to the `/twiml` URL printed at startup using HTTP POST. Only the configured owner's caller number is accepted.

## The conversation

Buddy asks permission, then covers accomplishments, learning/progress, spending, income, wellbeing, tomorrow's priority, and extra notes. It asks one question at a time, clarifies unknown amounts, records skips explicitly, and supports corrections. It reads back a summary and asks for confirmation before marking the record complete.

Money uses exact decimals. Different currencies have separate totals. It never treats a skipped spending question as a confirmed zero. The agent can only invoke defined tools; the service validates the section and tool input. Saved answers are restored when you resume after a dropped call. Speech extraction is still performed by an AI model; verify its read-back, especially amounts and names.

## Logs and data

Logs carry local timestamps and labels: `[NGROK]`, `[TWILIO]`, `[DEEPGRAM]`, `[YOU]`, `[BUDDY]`, `[SAVE]`, and `[SHEETS]`. Conversations are displayed as requested. Credentials and complete provider settings are never logged. Logs stay in your terminal; the SQLite database retains the transcript and answers in `data/buddy.sqlite3`.

The Google tab stores one row per check-in with daily sections, detailed expense/income JSON, totals by currency, skipped sections, status, timestamps and call status. Each local revision updates the same reserved row using `RAW` input. Sheets failures leave the local record intact and retry with increasing delays, up to five minutes. `sync` requests an immediate retry. Pending and completed records are labeled separately.

