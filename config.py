import os
from dotenv import load_dotenv

load_dotenv()

DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
PUBLIC_HOSTNAME = os.getenv("PUBLIC_HOSTNAME", "localhost:8000")
PORT = int(os.getenv("PORT", 8000))
DEEPGRAM_WS_URL = "wss://agent.deepgram.com/v1/agent/converse"

PROMPT = (
    "You are a friendly, helpful, and concise AI phone assistant. "
    "Keep your responses short, conversational, and within 1 or 2 sentences. "
    "Do not use markdown, emojis, or bullet points because replies are spoken aloud."
)

GREETING = "Hi! Thanks for calling. How can I help you today?"

AGENT_SETTINGS = {
    "type": "Settings",
    "audio": {
        "input": {"encoding": "mulaw", "sample_rate": 8000},
        "output": {"encoding": "mulaw", "sample_rate": 8000, "container": "none"},
    },
    "agent": {
        "language": "en",
        "listen": {
            "provider": {
                "type": "deepgram",
                "version": "v2",
                "model": "flux-general-en",
            }
        },
        "think": {
            "provider": {
                "type": "open_ai",
                "model": "gpt-4o-mini",
            },
            "prompt": PROMPT,
        },
        "speak": {
            "provider": {
                "type": "deepgram",
                "version": "v2",
                "model": "flux-alexis-en",
            }
        },
        "greeting": GREETING,
    },
}
