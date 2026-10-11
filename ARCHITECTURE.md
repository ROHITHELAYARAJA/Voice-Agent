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
| Write the default local Excel summary and conversation log, with atomic replacement | `buddy/excel.py` |
| Format timestamped terminal logs | `buddy/logging.py` |

The call path is terminal command → Twilio Calls API → signed TwiML webhook → Twilio bidirectional Media Stream → Deepgram Voice Agent. Deepgram manages Flux STT and Gemini 3.8 Flash; the configured ElevenLabs endpoint provides Jessica speech. Twilio and Deepgram both use mulaw at 8 kHz. Your server forwards audio bytes without transcoding.

Call initiation checks the account type. Trial accounts receive the minimal `To`, `From`, `Url` request, while full accounts receive callbacks and call limits. A runtime task reads active call status every three seconds; duplicate or regressing updates do not rewrite the session. Call rejection leaves the server and tunnel online. Current Twilio trial restrictions block Media Streams, so trial dialing alone does not establish the agent audio path; the terminal and live doctor make that limitation explicit.

The default write path is Gemini tool request → validated check-in service → SQLite commit → asynchronous local Excel update. ConversationText commits the transcript and wakes the same writer. Google Sheets is optional and its authentication dependencies are installed only through the google-sheets extra. The server owns the next question and refuses completion until all sections are answered or skipped and confirmation is provided. Tool definitions defer execution until the speaker finishes the turn.

Money details can be marked incomplete without inventing amounts. `details_complete` is stored with the spending/income answer, exposed through `incomplete_money_sections`, and rendered in the existing notes columns. Structured entries and totals contain only confirmed exact amounts. The model must read back incomplete details before final confirmation; schema and server checks enforce amount constraints, question order and saving, while interpretation of speech remains the model's responsibility.

Use a single process for this personal agent. SQLite is the authoritative record and Excel is its local readable copy. Keep the computer awake and the process running. Each Excel save uses a temporary file in the destination folder and atomic replacement; a locked workbook leaves the previous file intact and retries from SQLite. Check-in and transcript IDs prevent duplicate rows, and mismatched headers stop writes. In optional Google mode, fixed-row writes retry safely after a lost response and stop if a reserved row belongs to another check-in.
