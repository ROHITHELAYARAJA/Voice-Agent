# Buddy's implementation contract

Buddy is a terminal application. No dashboard, browser interface, or web API for starting calls is served. FastAPI exposes only the phone bridge and a minimal health endpoint.

The architecture was developed with the local Archify skill, then revised to follow the terminal-only requirement. The Archify specification is retained under `.archify` as a design contract. Runtime behavior is owned by the source files below, with regression checks in `tests`.

| Responsibility | Source of truth |
| --- | --- |
| Start server and ngrok, accept terminal commands, check provider access | `run.py` |
| Read configuration without exposing secret values | `config.py`, `setup.py` |
| Own call initiation, recipient restriction, status and concurrency | `buddy/runtime.py`, `buddy/telephony.py` |
| Authenticate Twilio webhooks and media handshakes; return bidirectional TwiML | `main.py` |
| Relay mulaw audio, handle interruptions, tool responses and playback before ending | `buddy/bridge.py` |
| Define Gemini instructions and the authenticated ElevenLabs Jessica endpoint | `buddy/agent.py` |
| Enforce question order, corrections, consent, skips and completion | `buddy/checkin.py`, `buddy/models.py` |
| Persist answers, transcript, versions, row reservations and retry state | `buddy/storage.py` |
| Authenticate Google, protect existing headers, update fixed rows and retry failures | `buddy/sheets.py` |
| Format timestamped terminal logs | `buddy/logging.py` |

The call path is terminal command → Twilio Calls API → signed TwiML webhook → Twilio bidirectional Media Stream → Deepgram Voice Agent. Deepgram manages Flux STT and Gemini 3.8 Flash; the configured ElevenLabs endpoint provides Jessica speech. Twilio and Deepgram both use mulaw at 8 kHz. Your server forwards audio bytes without transcoding.

The write path is Gemini tool request → validated check-in service → SQLite commit → asynchronous Google Sheets update. The server owns the next question and refuses completion until all sections are answered or skipped and confirmation is provided. Tool definitions defer execution until the speaker finishes the turn.

Use a single process for this personal agent. SQLite and the dedicated Google tab are a matched persistence pair. Retain the database and do not reorder, delete or replace the tab's rows. Fixed-row writes retry safely after a lost response; if a reserved row contains another check-in, sync stops instead of overwriting it.
