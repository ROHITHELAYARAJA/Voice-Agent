# Buddy implementation contract

The retained Archify specification under `.archify` describes Buddy's architecture. Source files own runtime behavior. The application exposes signed phone endpoints, a minimal health endpoint and terminal commands.

| Responsibility | Source of truth |
| --- | --- |
| Server, ngrok, commands and live checks | `run.py`, `tunnel.py` |
| Modes, credentials and local-only AI address | `config.py`, `setup.py` |
| Official runtime and model setup | `setup_local.py`, `buddy/local_server.py` |
| Account-aware dialing, status polling and concurrency | `buddy/telephony.py`, `buddy/runtime.py` |
| Signed TwiML, answer and status webhooks | `main.py` |
| Phone turns, consent, summary, corrections and trial budget | `buddy/phone.py` |
| Shared prompt and validated structured interpretation | `buddy/local_ai.py`, `buddy/deepgram_ai.py` |
| Managed Jessica audio and private call-bound playback | `buddy/voice_audio.py` |
| Provider-compatible function schemas | `buddy/provider_schema.py` |
| Explicit stop requests and spoken amount evidence | `buddy/safety.py` |
| Question order, money constraints and explicit completion | `buddy/checkin.py`, `buddy/models.py` |
| SQLite answers, transcripts and persistent phone responses | `buddy/storage.py` |
| Atomic Excel saves and optional Google sync | `buddy/excel.py`, `buddy/sheets.py` |
| Optional Deepgram streaming relay | `buddy/bridge.py`, `buddy/agent.py` |
| Tamil prompt and localized questions | `buddy/language.py`, `prompts/tamil_voice_agent.txt` |
| Local Whisper and interruption controls | `buddy/whisper_stt.py`, `buddy/stream_audio.py`, `buddy/whisper_bridge.py` |
| Actual provider verification without phone calls | `verify_local.py`, `verify_deepgram.py` |

Configured call path: terminal -> Jessica audio preparation and model readiness -> Twilio Calls API -> authenticated /twiml -> Gather speech input -> authenticated /answer -> durable speech -> Deepgram InjectUserMessage / GPT-4.1 Mini structured interpretation -> server-validated answer -> Play Jessica WAV -> readback and explicit confirmation. Twilio transcribes online; Deepgram hosts reasoning and managed ElevenLabs voice. SQLite and Excel remain local. The optional local provider uses Ollama and Twilio Say.

The managed speak settings use the user's supplied `eleven_turbo_v2_5` and Jessica `voice_id`, without an endpoint or separate key. GPT-4.1 Mini uses the managed OpenAI integration; the retained GPT-6 branch uses `reasoning_mode: none` and no temperature override. Direct Media Streams use 8 kHz µ-law; the exported browser settings use linear16 48/24 kHz. A trial account is rejected before any stream call is created.

Only public static prompts are persisted as model/voice-keyed WAV cache files. Personal summary audio is never written to this cache. One clarification per topic is enforced by the server, independent of model instructions. Unresolved amounts remain incomplete with empty unconfirmed entries; review is not auto-approved. Recognition uses a configurable one-second pause.

Jessica audio is generated through Deepgram, assembled as 24 kHz mono PCM WAV, and exposed through bounded, expiring opaque URLs tied to the call SID. HTTP audio requests are private/no-store. Static questions are prepared before dialing; readback fragments are prepared while the user answers following questions. Only the server supplies questions and decides completion. Provider connections are closed at call end, dial failure and shutdown.

Phone turns are keyed by call SID and turn number. Prompts, inputs, interpretations and final responses are durable. Repeated delivery reuses the response; conflicting input is rejected. Corrections replace money entries instead of appending duplicates. Resumed calls require fresh permission before disclosing saved details. Only the bound call SID and configured recipient may submit answers, using Twilio signatures or a trial call secret.

The new Twilio trial proxy omits the signature header. Outbound trial Gather calls therefore use a random secret generated for each call attempt, carried in the TwiML and answer URLs. The server validates that secret in constant time together with the bound call SID, recipient, account when provided, and active call status. Finished calls expire that authorization; resumes rotate the secret. A present but invalid signature is always rejected. Full accounts continue to require Twilio signatures. Terminal request logs omit query strings and secret values.

The normal flow uses nine submitted answers, including consent and final review. A ten-answer ceiling leaves one spare turn; exhaustion ends the partial check-in for manual resume. Silence, clarification and corrections consume the same budget. Interpretation times out safely; captured speech remains durable but is not marked validated. Model warming happens before dialing.

Write path: speech or validated answer -> SQLite commit -> background writer -> atomic Excel replacement. Excel contains check-ins and conversation logs. Locked files retry, mismatched headers stop writes, and IDs prevent duplicate rows. Google Sheets is optional with separate dependencies. Unknown and estimated amounts stay explicit in notes, outside confirmed totals.

The original media stream path remains optional through CALL_MODE=stream and requires provider access. The local AI endpoint is loopback-only and cloud models are rejected. Call status reads release busy/no-answer/completed slots and ignore duplicate or regressing updates. A rejected initial call leaves Buddy and ngrok online.

Trial Gather uses Tamil Chirp 3 STT. Eligible Stream accounts can deliver inbound µ-law audio to per-call stateful PCM conversion and WebRTC VAD, then local Whisper small. Shared interpretation and review rules continue to own validated answers. Voice onset clears Twilio playback and cancels inference before transcription; generation checks prevent stale output from being sent or saved. Completion requires acknowledged summary playback and explicit approval. Cleared marks never satisfy this prerequisite.
