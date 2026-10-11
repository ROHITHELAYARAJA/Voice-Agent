# 🎙️ Twilio & Deepgram Voice Agent

A real-time AI Voice Agent phone bridge connecting **Twilio Media Streams** to the **Deepgram Voice Agent API** with **Flux STT**, **LLM turn-taking**, **Flux TTS**, and real-time **barge-in interruption**.

---

## 🚀 Architecture

```text
Caller (Phone) <---> Twilio Voice <---> FastAPI Bridge (/media) <---> Deepgram Voice Agent API
```

- **Twilio Bridge**: FastAPI handles the incoming TwiML webhook (`/twiml`) and bidirectional media stream (`/media`).
- **Deepgram Voice Agent API**: Unified conversational WebSocket managing Flux STT (`flux-general-en`), LLM (`gpt-4o-mini`), and Flux TTS (`flux-alexis-en`).
- **Barge-In (Interruption)**: Flushes buffered Twilio audio immediately via `clear` events when `UserStartedSpeaking` is triggered.
- **Audio Codec**: Direct mulaw 8000Hz bidirectional passthrough matching telephony standards with zero transcoding overhead.
- **Ngrok Tunneling**: Built-in `tunnel.py` to expose local ports publicly for Twilio webhooks.

---

## 📁 Project Structure

```text
Voice-Agent/
├── config.py         # Voice Agent settings, prompt, models, and audio format
├── main.py           # FastAPI server bridging Twilio and Deepgram Voice Agent
├── tunnel.py         # Standalone Ngrok tunnel manager (CLI & module)
├── pyproject.toml    # Dependencies and project specifications
├── .python-version   # Python 3.12 version pinning
├── .env.example      # Environment variables template
├── .env              # Secrets and API keys (git-ignored)
└── .gitignore        # Git ignore rules
```

---

## 🛠️ Configuration

Copy `.env.example` to `.env` and fill in your keys:

```env
DEEPGRAM_API_KEY=your_deepgram_api_key_here
NGROK_AUTHTOKEN=your_ngrok_authtoken_here
PUBLIC_HOSTNAME=your_host.ngrok-free.app
PORT=8000
```

### Agent Configuration (`config.py`)

All Voice Agent behavior is defined in `config.py`:
- **Audio**: mulaw at 8000Hz (input and output)
- **Listen**: Deepgram Flux v2 (`flux-general-en`)
- **Think**: OpenAI `gpt-4o-mini` with customizable system prompt
- **Speak**: Deepgram Flux v2 (`flux-alexis-en`)
- **Greeting**: Customizable welcome message spoken upon call connect

---

## 🏃 Running the Voice Agent

### 1. Start the Voice Agent Server

```bash
uv run python main.py
```

Runs on `http://localhost:8000`.

### 2. Expose with Ngrok Tunnel

In a separate terminal:

```bash
uv run python tunnel.py --port 8000
```

Or using native CLI:

```bash
ngrok http 8000
```

Copy your ngrok forwarding hostname (e.g. `xyz.ngrok-free.app`) to `PUBLIC_HOSTNAME` in `.env`.

---

## 📞 Twilio Setup

1. In the **Twilio Console**, go to **Phone Numbers -> Manage -> Active numbers -> [Your Number]**.
2. Under **Voice Configuration**, set **A call comes in** to:
   - **Webhook**: `https://<YOUR_PUBLIC_HOSTNAME>/twiml`
   - **HTTP Method**: `HTTP POST`
3. Call your Twilio phone number and talk to the agent!

---

## 📄 License

MIT
