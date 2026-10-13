# Nila and the Buddy voice prototype

Nila is the new private wellness application in `apps/web`, with its product API in `apps/api`, tenant-aware Python voice adapter in `services/voice-python`, shared call worker, and Supabase migrations. The existing Buddy phone and Excel prototype below remains separate.

Run `npm ci` and `npm run dev` to open the local Nila website at <http://localhost:3000>. The public product preview uses clearly labelled sample information. The supplied Supabase project is connected and its initial schema is installed. Cloud calling still needs the backend credentials, Render and Vercel resources, and approved staging verification. The separate website checkout is `C:/Users/erohi/OneDrive/Desktop/Nila-`.

- [Design system and page plan](docs/nila/design-system.md)
- [Architecture, migration plan and diagrams](docs/nila/architecture.md)
- [Setup and deployment](docs/nila/setup-and-deployment.md)
- [Verification and launch gates](docs/nila/launch-gates.md)

Automatic deployment and outbound platform calling are disabled until staging approval and provider verification. Existing personal keys may be imported only into the explicitly verified owner's account using `npm run import:legacy`; never share those keys across customers. `npm run preflight` reports missing local deployment settings without displaying secret values.

## Buddy: telephone check-ins with Deepgram and Jessica

Buddy calls your configured number, asks about your day one question at a time, and writes answers and conversation logs to local Excel. Your computer runs the server and storage; the terminal shows each question, spoken answer, interpretation and save result.

The configured pipeline is **Twilio speech input -> authenticated ngrok webhook -> Deepgram Voice Agent / GPT-4.1 Mini -> ElevenLabs Jessica audio via Deepgram -> SQLite -> Excel**. `CALL_MODE=gather` uses supported trial Gather and Play features. Twilio captures speech; the saved Deepgram key provides managed reasoning and Jessica (`eleven_turbo_v2_5`, voice `cgSgspJ2msm6clMCkdW9`). No separate OpenAI or ElevenLabs key is required with `TTS_CONNECTION=managed`. Provider usage consumes Deepgram project credits; telephone usage remains with Twilio.

## Start

Open PowerShell in this project's actual directory:

```powershell
Set-Location -LiteralPath 'C:\Users\erohi\OneDrive\Desktop\Voice-Agent'
uv sync
uv run python run.py --doctor --live-check
uv run python run.py --call
```

Saved Twilio and ngrok credentials stay in `.env`. Use `uv run python setup.py` when preferences or credentials need updating; Enter keeps saved values and secret input is hidden.

Phone recognition waits one second after speech stops; set `PHONE_SPEECH_TIMEOUT=2` if you prefer longer thinking pauses. Buddy prepares reusable Jessica audio and checks real model interpretation before dialing. GPT-4.1 Mini uses managed tool calls with server validation. GPT-6 remains an optional model with its required reasoning compatibility settings. Calls are manual. No scheduler places calls automatically. An initial call failure leaves Buddy and ngrok online.

## Configuration

| Variable                                                                    | Purpose                                                              |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `CALL_MODE=gather`                                                          | Question-by-question phone conversation                              |
| `GATHER_AI_PROVIDER=deepgram`, `DEEPGRAM_API_KEY`                           | Managed, validated answer interpretation                             |
| `PHONE_VOICE_PROVIDER=eleven_labs`, `TTS_CONNECTION=managed`                | Jessica through the Deepgram key                                     |
| `LLM_PROVIDER=open_ai`, `LLM_MODEL=gpt-4.1-mini`                            | Requested reasoning model                                            |
| `TTS_MODEL=eleven_turbo_v2_5`                                               | Requested Jessica model                                              |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`                                   | Account authentication and signed webhooks                           |
| `TWILIO_PHONE_NUMBER`                                                       | Assigned calling number                                              |
| `OWNER_PHONE_NUMBER`                                                        | Verified destination in international format                         |
| `NGROK_AUTHTOKEN`                                                           | Public HTTPS connection to this computer                             |
| `LOCAL_MODEL=qwen3:1.7b`                                                    | Downloaded Ollama model                                              |
| `LOCAL_AI_URL=http://127.0.0.1:11434`                                       | Loopback model service                                               |
| `PHONE_LANGUAGE=ta-IN`                                                      | Twilio Tamil speech recognition language                             |
| `CONVERSATION_LANGUAGE=ta`, `PHONE_SPEECH_MODEL=googlev2_chirp_3`           | Tamil conversation and trial recognition                             |
| `STREAM_STT_PROVIDER=whisper`, `WHISPER_MODEL=small`, `WHISPER_DEVICE=auto` | Optional local Tamil recognition on eligible stream accounts         |
| `PHONE_SPEECH_TIMEOUT=1`                                                    | Seconds of silence that end an answer; 1-5 allowed                   |
| `PHONE_VOICE=Polly.Aditi`                                                   | Voice when the optional Twilio voice provider is selected            |
| `SHEET_BACKEND=excel`                                                       | Default local spreadsheet copy                                       |
| `EXCEL_FILE`                                                                | Optional `.xlsx` path; defaults to `data/Buddy Daily Check-ins.xlsx` |
| `TIMEZONE=Asia/Kolkata`, `CURRENCY=INR`                                     | Date and default currency                                            |

## Conversation and saving

Buddy asks permission, then covers accomplishments, learning, spending, income, wellbeing, tomorrow and other notes. It reads a summary and requires explicit confirmation before completion. Say a correction to replace an earlier answer, skip to skip a question, or ask to stop. Press 1 to approve consent or final review; press 2 to decline consent, skip a regular question, or pause final review.

The opening is a short friendly greeting without a recording announcement. Buddy does not request telephone recordings from Twilio. Any announcement preceding Buddy is outside this application. A clear answer is enough; plans and unfinished work remain labelled by the user's own words. At most one targeted clarification is asked per topic. If still unresolved, Buddy preserves the raw context, excludes unknown money from totals, and advances. Review remains mandatory; unresolved review or repeated silence pauses instead of looping.

Speech is committed before AI interpretation. Model responses are validated before changing an answer. Unknown or estimated amounts remain in notes and are excluded from confirmed totals. Repeated webhook delivery reuses a saved response without duplicating answers or money. Model failure pauses the call, retains its transcript, and leaves the check-in unfinished. Resume asks fresh permission and repeats unanswered questions; a transcript alone is not treated as a validated answer.

The server recognizes explicit stop requests independently of the model. Expense and income amounts must also match numeric or English number evidence from your answer, the current clarification, or a saved entry being corrected. Unsupported or uncertain amounts trigger clarification. The final spoken readback remains mandatory.

Full-account webhooks use Twilio signatures. The current trial proxy omits that header; Buddy authenticates outbound trial callbacks using a unique call secret, the bound call ID, your number, and active call status. Secrets rotate on resume and are excluded from terminal logs. HTTP failures now appear under WEBHOOK with method, path, status and response time.

SQLite is the authoritative record. Excel is written atomically in the background. If the workbook is locked, close it and use `sync`; answers remain in SQLite. The summary has these 18 columns: Check-in ID, Date, Status, Accomplishments, Learning, Spending notes, Spending totals, Expenses, Income notes, Income totals, Income entries, Wellbeing, Tomorrow, Notes, Skipped sections, Timezone, Updated at, Call status. Conversation Log contains Log ID, Check-in ID, Timestamp, Speaker, Message.

## Terminal commands

`call`, `resume <check-in-id>`, `hangup`, `status`, `list`, `show <check-in-id>`, `sync`, `help`, `quit`.

`--non-interactive` runs with logs only. `--no-tunnel` uses an existing `PUBLIC_HOSTNAME`. Keep the computer awake and Buddy running throughout a call.

## Trial limits

Twilio documents 75 voice minutes per trial, a 30-day trial, 10 minutes per call, a five-second webhook fetch timeout and 10 action/redirect hops. Speech recognition and text-to-speech are included in the trial allowance. Actual remaining minutes and eligibility belong to your account. See [trial allowance](https://www.twilio.com/docs/usage/trials) and [supported speech features and limits](https://www.twilio.com/docs/usage/trials/try-out-voice).

Buddy allows at most 10 submitted answers per call, including silence, clarification and corrections. The normal flow fits that budget. Extra turns can end the call early; Buddy saves the partial check-in and asks you to resume manually. No follow-up call is placed automatically. Interpretation has a 3.5-second request deadline to leave time for the webhook response. Trial call-control APIs may reject terminal hangup; Buddy reports the provider message, while conversational TwiML ends with `<Hangup>`.

## Optional modes

The active phone settings now use Tamil speech recognition and Jessica's Tamil voice. The editable prompt supplement in `prompts/tamil_voice_agent.txt` is loaded by both managed and local interpretation. It preserves negation, corrections, unfinished work and uncertain money, accepts Tamil and Tanglish, and keeps final review mandatory. Trial Gather transcribes through Twilio, not local Whisper.

OpenAI Whisper is installed from the official repository at pinned commit `86098128c0b4f24f0e2aa2994de830614b474227`. Its multilingual small checkpoint is downloaded under `data/whisper-models`. Windows uses CUDA PyTorch; phone PCM is passed directly to Whisper without an FFmpeg subprocess. Prepare or test it with:

```powershell
uv sync --extra whisper
uv run --extra whisper python setup_whisper.py
uv run --extra whisper python setup_whisper.py --audio 'C:\path\Tamil sample.wav'
```

Your account was checked as Trial on 2026-10-12. [Twilio blocks Stream on trial accounts](https://www.twilio.com/docs/usage/trials/try-out-voice), so Buddy rejects this combination before dialing. No upgrade or billing change was made. Keep `CALL_MODE=gather` for the current account. On an account that permits Media Streams, set `CALL_MODE=stream`, `STREAM_STT_PROVIDER=whisper`, and `PHONE_VOICE_PROVIDER=eleven_labs`, then run `uv run --extra whisper python run.py --call`.

The Whisper path uses WebRTC VAD independently of transcription. After three 20 ms voiced frames it sends Twilio clear, cancels Jessica playback and interpretation, and advances a response generation counter. Late synthesis, interpretations and cleared playback marks cannot restart speech or approve completion. After 700 ms of silence, Whisper transcribes the answer, the existing AI validates it, and Buddy asks the next question. Too-short noise resumes the current prompt. Final approval requires acknowledged summary playback. These controls passed simulated stream tests; real telephone interruption remains unverified because the trial blocks streaming.

Gather nests Jessica playback inside speech collection, allowing answers during prompts. The trial does not provide the raw audio needed for Buddy's local speech-onset control. Its interruption timing and Tamil recognition still require a real call test. `STREAM_STT_PROVIDER=deepgram` retains the original English Flux path on eligible accounts; Flux is not used for Tamil transcription.

`CALL_MODE=stream` connects Twilio Media Streams directly to Deepgram Flux, GPT-4.1 Mini and Jessica. Twilio's current trial blocks Stream, so Buddy rejects this mode before dialing on a trial account. Direct telephone streaming requires µ-law at 8 kHz in both directions. The browser example in `outputs/agent-settings/browser.json` uses your requested linear16 48 kHz input and 24 kHz output, with the Buddy prompt and tools filled in. `Welcome` alone proves a connection; model and audio checks are separate.

To restore local reasoning and Twilio speech, set `GATHER_AI_PROVIDER=local` and `PHONE_VOICE_PROVIDER=twilio`, then run `uv run python setup_local.py`. Ollama is loopback-only and cloud models are rejected. Deepgram and Jessica are unused in that combination.

Reusable Jessica questions and clarification prompts are cached in memory and on disk under `data/voice-cache`; cache keys include the model and voice. Personal answers and summaries remain in the bounded memory cache. Audio is pre-generated during the preceding question. Summary audio is split into faithful sections, prepared as answers are saved. Audio URLs contain random capabilities, expire after 15 minutes, bind to the specific call, and contain no transcript or credentials. The server omits audio URLs from request logs. Playback does not add redirect hops. Captured speech and interpretations remain durable in SQLite; model or audio failures do not invent completion.

Google Sheets remains optional: install `uv sync --extra google-sheets`, then configure its spreadsheet ID, service-account file and `SHEET_BACKEND=google`. Excel needs no Google credentials, billing account, or Excel installation.

## Verification

```powershell
uv run pytest -q --basetemp=outputs/pytest-phone-check
uv run ruff check .
uv run python verify_deepgram.py
uv run python verify_local.py
uv run --extra whisper pytest -q --basetemp=outputs/pytest-whisper-check
uv run python verify_tamil.py
```

The updated Deepgram/Jessica configuration passed 55 regression tests and lint on 2026-10-12. The earlier GPT-6 configuration had a real answered telephone test that connected through the authenticated trial webhook, captured speech, and wrote nine conversation rows to the daily Excel workbook. That live check-in ended before final review, so it remains interrupted. The live connection receipt is in `outputs/deepgram-telephone-verification`.

The previously verified local mode had 45 passing regression tests on 2026-10-12. A real outbound call captured all answers, received spoken final confirmation, and saved a completed daily check-in plus 19 conversation log rows. The isolated model test confirmed 200.00 INR with a maximum 1.64-second webhook response; the real call stayed below 2.3 seconds. Receipts are in `outputs/local-verification` and `outputs/telephone-verification`.

The Deepgram verifier uses actual GPT-4.1 Mini inference, generates and fetches Jessica WAV audio, checks confirmed totals and an isolated Excel workbook, and writes its receipt to `outputs/deepgram-verification`. It simulates up to three seconds of playback per clip to represent the interval between telephone answers. It does not call your phone. Its latest successful run verified 200.00 INR, 28 audio responses, and a maximum 2.83-second webhook.

The speed checks compare model and voice providers in `outputs/latency-verification`. GPT-4.1 Mini was selected for response speed and reliable interpretation. Warm model interpretation was approximately 1.0-1.5 seconds in the final API run. Those times exclude the configurable telephone silence interval and network/provider variation. The full API-to-Excel check passes; the changed version has not yet been retested on a real telephone call.

The local verifier uses actual model inference with signed simulated webhooks, checks confirmed totals, and creates an isolated workbook and receipt in `outputs/local-verification`. It does not call your phone or alter the daily workbook. Real phone verification requires an accepted call, audible prompt, captured speech and saved answer; authentication alone is insufficient.

Architecture ownership and the retained Archify contract are in `ARCHITECTURE.md`. References: [Twilio Gather](https://www.twilio.com/docs/voice/twiml/gather), [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [Ollama chat API](https://docs.ollama.com/api/chat).

Tamil verification on 2026-10-12 passed 65 regression tests and lint. Actual GPT-4.1 Mini and Jessica providers completed a simulated Tamil webhook-to-Excel check with confirmed 200.00 INR, 28 audio responses, and a maximum 1.797-second webhook. No telephone call was placed and the daily workbook was not modified. Receipts are in `outputs/tamil-verification` and `outputs/whisper-verification`. Whisper preserved the 120-rupee amount in a synthetic Tamil Jessica sample, including after telephone-codec conversion, with some spelling differences. Accuracy with a live human Tamil caller remains unverified.
