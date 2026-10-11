import os
from dotenv import load_dotenv

load_dotenv()

DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
PUBLIC_HOSTNAME = os.getenv("PUBLIC_HOSTNAME", "localhost:8000")
PORT = int(os.getenv("PORT", 8000))
DEEPGRAM_WS_URL = "wss://agent.deepgram.com/v1/agent/converse"

GREETING = "Hello! How may I help you?"

PROMPT = (
    "You are a friendly, helpful, and concise voice phone assistant. "
    "Keep your responses natural and conversational, strictly within 1 or 2 sentences. "
    "Do not use markdown, emojis, asterisks, or bullet points because replies are spoken aloud. "
    "If the user asks to calculate or do math, use the arithmetic function. "
    "If the user says goodbye or wants to end the call, use the end_conversation function."
)

KEYTERMS = [
    "Deepgram",
    "ElevenLabs",
    "Twilio",
    "Gemini",
    "Voice Agent",
]

FUNCTIONS = [
    {
        "name": "arithmetic",
        "description": "Performs basic arithmetic operations.",
        "parameters": {
            "type": "object",
            "properties": {
                "operation": {
                    "type": "string",
                    "enum": ["add", "subtract", "multiply", "divide"],
                },
                "a": {"type": "number"},
                "b": {"type": "number"},
            },
            "required": ["operation", "a", "b"],
        },
    },
    {
        "name": "end_conversation",
        "description": "Ends the phone call gracefully.",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {
                    "type": "string",
                    "description": "Reason for ending the conversation",
                }
            },
        },
    },
]

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
                "keyterms": KEYTERMS,
            }
        },
        "think": {
            "provider": {
                "type": "google",
                "model": "gemini-2.5-flash",
                "temperature": 0.7,
            },
            "prompt": PROMPT,
            "functions": FUNCTIONS,
        },
        "speak": {
            "provider": {
                "type": "eleven_labs",
                "model_id": "eleven_turbo_v2_5",
                "voice_id": "cgSgspJ2msm6clMCkdW9",
            }
        },
        "greeting": GREETING,
    },
}
