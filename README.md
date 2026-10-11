# Buddy: terminal daily check-in calls

Buddy calls your configured phone number, asks about your day one question at a time, and saves answers and conversation logs to a local Excel file. Your computer runs the server. Everything runs from the terminal: no UI and no browser dashboard. Excel storage needs no Google account, billing account, credentials or Excel installation.

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

The default `SHEET_BACKEND=excel` saves to `data/Buddy Daily Check-ins.xlsx`. Optionally set `EXCEL_FILE` to a different `.xlsx` file path. Setup no longer asks for Google credentials.

Google Sheets is an optional integration: install it with `uv sync --extra google-sheets`, set `SHEET_BACKEND=google`, `GOOGLE_SHEET_ID`, `GOOGLE_CREDENTIALS_FILE` and optionally `GOOGLE_SHEET_TAB=Buddy Checkins` in `.env`. Enable its API and share the sheet with the service account as Editor. Leave the backend as Excel to avoid all Google setup.

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
| `sync` | Retry pending Excel writes, or Google updates if explicitly enabled |
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

The call instructions in `buddy/agent.py` handle unclear yes/no answers, wrong recipients, voicemail, background speech, interruptions, repeated questions, forgotten details, several topics in one answer, corrections, ambiguous numbers, duplicate purchases, totals versus item lists, estimates, refunds, loans, transfers and events outside the check-in date. Buddy asks a focused clarification, preserves uncertainty, and respects an explicit skip or stop. Resumed calls ask fresh permission before discussing saved answers.

Money sections include `details_complete` in the tool input. False means some amounts are unknown or estimated; those facts stay in the spending/income notes, and only confirmed exact amounts enter totals. The saved tool state identifies `incomplete_money_sections`. Spreadsheet notes display the incomplete flag without adding or changing columns. Final confirmation may approve a record containing explicitly unknown amounts; it never invents the missing amounts.

Money uses exact decimals. Different currencies have separate totals. It never treats a skipped spending question as a confirmed zero. The agent can only invoke defined tools; the service validates the section and tool input. Saved answers are restored when you resume after a dropped call. Speech extraction is still performed by an AI model; verify its read-back, especially amounts and names.

## Deepgram credits

Gemini is configured as Deepgram's managed Google model without a separate `think.endpoint` or Google API key. Deepgram's Voice Agent usage uses the balance associated with `DEEPGRAM_API_KEY`. New accounts advertise $200 of free credits: [Deepgram pricing](https://deepgram.com/pricing). A valid key and an available model do not prove the remaining balance is promotional credit.

Check the account's Billing page in [Deepgram Console](https://console.deepgram.com/) for the actual remaining credit and auto-load settings. Keep auto-load disabled to avoid automatic top-ups. The configured key was verified for project and balance access on October 12, 2026. Balance checks are snapshots; usage reduces the remaining credit. Keys without billing permissions may return HTTP 403 even when Voice Agent access works. Deepgram credits do not pay for Twilio calls or Jessica's external ElevenLabs API usage: [ElevenLabs billing](https://elevenlabs.io/docs/overview/administration/billing).

## Logs and data

Logs carry local timestamps and labels: `[NGROK]`, `[TWILIO]`, `[DEEPGRAM]`, `[YOU]`, `[BUDDY]`, `[SAVE]`, and `[SHEETS]`. Each conversation line displayed under YOU or BUDDY is saved to SQLite and queued for Excel immediately. Credentials and complete provider settings are never logged. Operational connection logs remain in the terminal.

The Excel file has two tabs: `Buddy Checkins` contains one row per check-in with daily sections, detailed expense/income JSON, totals by currency, skipped sections, status, timestamps and call status. `Conversation Log` contains timestamped speech with speaker and check-in ID. Corrections update the existing check-in, and retrying does not duplicate conversation lines. Speech beginning with `=` stays literal text rather than becoming an Excel formula.

Writes use an atomic file replacement. If the file is locked while open in Excel, answers remain in `data/buddy.sqlite3`; close the workbook and enter `sync` to retry. Automatic retries use increasing delays up to five minutes. Keep the database backed up with the workbook. Treat the workbook as Buddy's generated record; make a copy for manual analysis. If the workbook is deleted, startup rebuilds it from the database. Google mode retains its fixed-row ownership checks and `RAW` writes; do not reorder or delete Google rows.

This is a personal, single-process development application. Your computer must stay awake with Buddy and ngrok running for calls and spreadsheet updates. Local storage is free, while Twilio and AI provider usage is subject to their trial credits, free-tier limits and pricing. Ngrok exposes only health and signed phone endpoints; no public call-control interface is served.

## Verification

```powershell
uv run ruff check .
uv run pytest -q
uv run python run.py --doctor --live-check
```

Tests use simulated providers and temporary databases. They check question order, consent, confirmation, corrections, exact currency totals, persistence, tool replay, webhook authentication, outbound recipient restriction, interruptions, graceful audio playback, Excel conversation capture, locked-file retries, history recovery, literal formula-like text, protected headers and duplicate-safe Google retry after a lost response. Live diagnostics check model availability and provider access without placing a phone call. They do not prove a full phone conversation or successful speech synthesis.

## Sources and architecture

Implementation follows the complete [Twilio and Deepgram Voice Agent guide](https://developers.deepgram.com/docs/twilio-and-deepgram-voice-agent), including bidirectional streams, mulaw 8 kHz audio and barge-in. The raw WebSocket bridge is an approach expressly described by that guide.

Provider configuration is checked against [Deepgram LLM models](https://developers.deepgram.com/docs/voice-agent-llm-models), its [live model catalog](https://agent.deepgram.com/v1/agent/settings/think/models), [ElevenLabs integration settings](https://developers.deepgram.com/docs/voice-agent-tts-models), [function requests](https://developers.deepgram.com/docs/voice-agent-function-call-request), [Twilio stream messages](https://www.twilio.com/docs/voice/media-streams/websocket-messages), and [Google Sheets value updates](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/update).

See `ARCHITECTURE.md` for the Archify-based implementation contract and ownership of each behavior.
