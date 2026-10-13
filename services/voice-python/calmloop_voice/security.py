import base64
import hashlib
import hmac
import json
import time
from uuid import UUID

from twilio.request_validator import RequestValidator


def decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def verify_capability(token: str, session_id: str, secret: str, now: float | None = None):
    now = time.time() if now is None else now
    if len(token) > 500 or token.count(".") != 1:
        raise ValueError("Invalid capability")
    payload, signature = token.split(".")
    expected = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest()
    if not hmac.compare_digest(expected, decode(signature)):
        raise ValueError("Invalid capability")
    value = json.loads(decode(payload))
    UUID(session_id)
    if value.get("id") != session_id or not now <= value.get("exp", 0) <= now + 1201:
        raise ValueError("Expired or mismatched capability")


def credentials(context: dict, provider: str) -> dict:
    return next(value for value in context["credentials"] if value["provider"] == provider)


def validate_handshake(public: str, signature: str, auth_token: str):
    validator = RequestValidator(auth_token)
    variants = (
        public,
        public + "/",
        public.replace("https://", "wss://", 1),
        public.replace("https://", "wss://", 1) + "/",
    )
    return any(validator.validate(url, {}, signature) for url in variants)


def validate_stream(start: dict, context: dict, session_id: str, token: str):
    params = start.get("customParameters", {})
    session = context["session"]
    if params.get("session_id") != session_id or not hmac.compare_digest(
        params.get("capability", ""), token
    ):
        raise ValueError("Stream association failed")
    if (
        start.get("accountSid") != credentials(context, "twilio")["account_sid"]
        or start.get("callSid") != session["call_sid"]
    ):
        raise ValueError("Call association failed")
    if start.get("mediaFormat") != {"encoding": "audio/x-mulaw", "sampleRate": 8000, "channels": 1}:
        raise ValueError("Unsupported audio")
    if not start.get("streamSid") or session["status"] != "in-progress":
        raise ValueError("Call is not active")
