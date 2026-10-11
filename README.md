# 🎙️ Voice-Agent

A real-time AI Voice Agent backend with built-in **Ngrok Public Tunneling**, **Deepgram Speech-to-Text** integration, and high-performance **WebSocket** duplex audio streaming.

---

## 🚀 Features

- **Duplex Audio Streaming**: Asynchronous WebSocket server (`websockets.asyncio`) designed for low-latency binary audio frames (PCM, μ-law, Opus) and JSON event messages.
- **Automated Public Tunnels**: Embedded Ngrok SDK integration (`tunnel.py`) to generate live `https://` and `wss://` endpoints on startup—perfect for webhooks, Twilio Media Streams, and remote clients.
- **Deepgram AI Integration**: Pre-configured with the official `deepgram-sdk` for real-time speech-to-text (STT) transcription and audio intelligence.
- **Modern Python Stack**: Built on **Python 3.12** and packaged with [uv](https://github.com/astral-sh/uv) for fast, reproducible dependency management.
- **Zero-Secret Leakage**: Environment variables isolated via `.env` and `.env.example` (enforced via `.gitignore`).

---

## 📁 Project Structure

```text
Voice-Agent/
├── main.py                 # Core Voice Agent WebSocket server with auto-tunnel
├── tunnel.py               # Standalone Ngrok tunnel utility (CLI & Python module)
├── pyproject.toml          # Project dependencies & Python version constraints
├── .python-version         # Pinned Python version (3.12)
├── .env.example            # Environment template for keys & configuration
├── .env                    # Local secrets (git-ignored)
├── .gitignore              # Git ignore rules for virtual environments & secrets
└── python-sdk-example/     # Reference Ngrok HTTP forwarder example
    ├── main.py
    ├── requirements.txt
    └── tunnel.py
```

---

## 🛠️ Quickstart

### 1. Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) (recommended)
- Ngrok Account ([Get Auth Token](https://dashboard.ngrok.com/get-started/your-authtoken))
- Deepgram Account ([Get API Key](https://console.deepgram.com/))

### 2. Configure Environment

Copy the example environment template and populate your credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```env
NGROK_AUTHTOKEN=your_ngrok_authtoken_here
DEEPGRAM_API_KEY=your_deepgram_api_key_here
PORT=8000
```

### 3. Install Dependencies

Using `uv`:

```bash
uv sync
```

---

## 🏃 Running the Application

### Option A: Start Full Voice Agent Server + Ngrok Tunnel

Runs the WebSocket voice streaming server on `localhost:8000` and automatically exposes both public `https://` and `wss://` URLs:

```bash
uv run python main.py
```

**Console Output:**
```text
============================================================
 🎙️  VOICE AGENT SERVER & NGROK TUNNEL
============================================================
 Starting local WebSocket server on localhost:8000...
------------------------------------------------------------
 🌐 Public HTTPS URL : https://<your-subdomain>.ngrok-free.dev
 🔗 Public WSS URL   : wss://<your-subdomain>.ngrok-free.dev
------------------------------------------------------------
 Server is ready and publicly accessible!
```

### Option B: Standalone Ngrok Tunnel CLI

Forward any local port to the internet on demand:

```bash
# Forward default port (8000)
uv run python tunnel.py --port 8000

# Forward custom port (e.g., 5000)
uv run python tunnel.py --port 5000
```

### Option C: Using Native `ngrok` CLI

The `ngrok` command-line executable is pre-installed in your virtual environment:

```bash
ngrok http 8000
```

---

## 🔒 Security Best Practices

- Never commit `.env` or hardcoded tokens to version control.
- All secrets are tracked in `.env` and excluded via `.gitignore`.
- Reference [.env.example](.env.example) for team members to configure their own credentials.

---

## 📄 License

MIT
