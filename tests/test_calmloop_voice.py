import base64
import hashlib
import hmac
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "services" / "voice-python"))
from calmloop_voice.conversation import Conversation, agent_settings
from calmloop_voice.security import validate_stream, verify_capability


def test_voice_startup_lists_missing_settings_without_revealing_secrets(monkeypatch):
    from calmloop_voice import app

    monkeypatch.setattr(app, "load_dotenv", lambda _: None)
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.setenv("VOICE_PUBLIC_URL", " ")
    monkeypatch.setenv("INTERNAL_SERVICE_SECRET", "private-test-secret")
    monkeypatch.setenv("VOICE_SESSION_SECRET", "private-session-secret")
    with pytest.raises(ValueError) as error:
        app.Environment.read()
    message = str(error.value)
    assert "API_INTERNAL_URL, VOICE_PUBLIC_URL" in message
    assert "Render's Environment" in message
    assert "private-test-secret" not in message
    assert "private-session-secret" not in message


def context():
    return {
        "session": {"call_sid": "CA" + "a" * 32, "status": "in-progress"},
        "preferences": {"language": "ta", "voice_id": "jessica-id"},
        "credentials": [
            {"provider": "twilio", "account_sid": "AC" + "a" * 32},
            {"provider": "elevenlabs", "api_key": "test-eleven"},
        ],
    }


def test_settings_use_tamil_nova_managed_model_and_native_elevenlabs():
    settings = agent_settings(context())
    assert settings["agent"]["listen"]["provider"]["language"] == "ta"
    assert settings["agent"]["listen"]["provider"]["model"] == "nova-3"
    assert settings["agent"]["think"]["provider"]["model"] == "gpt-4.1-mini"
    assert settings["agent"]["speak"]["endpoint"]["headers"]["xi-api-key"] == "test-eleven"
    assert settings["audio"]["output"] == {
        "encoding": "mulaw",
        "sample_rate": 8000,
        "container": "none",
    }
    assert all(function["defer_until_eot"] for function in settings["agent"]["think"]["functions"])


def test_capability_matches_node_hmac_and_rejects_other_session():
    session = "11111111-1111-4111-8111-111111111111"
    payload = (
        base64.urlsafe_b64encode(json.dumps({"id": session, "exp": 1200}).encode())
        .decode()
        .rstrip("=")
    )
    signature = (
        base64.urlsafe_b64encode(
            hmac.new(b"test-secret", payload.encode(), hashlib.sha256).digest()
        )
        .decode()
        .rstrip("=")
    )
    token = f"{payload}.{signature}"
    verify_capability(token, session, "test-secret", 100)
    with pytest.raises(ValueError):
        verify_capability(token, "22222222-2222-4222-8222-222222222222", "test-secret", 100)
    with pytest.raises(ValueError):
        verify_capability(token, session, "test-secret", 1300)


def test_stream_cannot_cross_customer_accounts():
    value = context()
    start = {
        "accountSid": "AC" + "b" * 32,
        "callSid": value["session"]["call_sid"],
        "streamSid": "MZ1",
        "mediaFormat": {"encoding": "audio/x-mulaw", "sampleRate": 8000, "channels": 1},
        "customParameters": {"session_id": "session", "capability": "token"},
    }
    with pytest.raises(ValueError):
        validate_stream(start, value, "session", "token")
    start["accountSid"] = "AC" + "a" * 32
    validate_stream(start, value, "session", "token")


def test_interrupted_readback_cannot_be_saved_by_cleared_mark():
    state = Conversation()
    state.remember("yes")
    state.confirm_permission("yes")
    state.remember("Work was stressful")
    state.prepare(
        {"statements": [{"kind": "stress", "quote": "Work was stressful", "topic": "work"}]}
    )
    mark = state.playback_mark()
    state.interrupt()
    state.acknowledge(mark)
    state.remember("yes")
    with pytest.raises(ValueError):
        state.reflection("yes")


def test_only_heard_approved_quotes_are_saved_and_corrections_block_save():
    state = Conversation()
    state.remember("ஆம்")
    state.confirm_permission("ஆம்")
    state.remember("My mood is 7 today")
    state.prepare(
        {
            "statements": [{"kind": "reflection", "quote": "My mood is 7 today"}],
            "mood_score": 7,
            "mood_evidence": "My mood is 7 today",
        }
    )
    state.acknowledge(state.playback_mark())
    state.interrupt()
    state.remember("yes but change it")
    with pytest.raises(ValueError):
        state.reflection("yes but change it")
    state.remember("yes")
    assert state.reflection("yes")["mood_score"] == 7


def test_hours_are_not_mood_scores():
    state = Conversation(consent=True, turns=["yes", "I worked 7 hours"])
    with pytest.raises(ValueError):
        state.prepare(
            {
                "statements": [{"kind": "reflection", "quote": "I worked 7 hours"}],
                "mood_score": 7,
                "mood_evidence": "I worked 7 hours",
            }
        )


def test_voice_webhook_validates_twilio_signature_and_emits_no_recording():
    import time

    from calmloop_voice.app import Environment, create_app
    from fastapi.testclient import TestClient
    from twilio.request_validator import RequestValidator

    session = "11111111-1111-4111-8111-111111111111"
    payload = (
        base64.urlsafe_b64encode(
            json.dumps({"id": session, "exp": int(time.time()) + 1200}).encode()
        )
        .decode()
        .rstrip("=")
    )
    signature = (
        base64.urlsafe_b64encode(hmac.new(b"s" * 32, payload.encode(), hashlib.sha256).digest())
        .decode()
        .rstrip("=")
    )
    capability = f"{payload}.{signature}"
    config = Environment("http://127.0.0.1:4000", "https://voice.example", "i" * 32, "s" * 32)
    value = context()
    value["phone"] = "+919000000001"
    value["credentials"][0].update(auth_token="test-auth", caller_number="+14155550100")
    events = []

    class FakeApi:
        async def request(self, session_id, action, body=None):
            assert session_id == session
            if action == "context":
                return value
            events.append((action, body))
            return {"saved": True}

    form = {
        "AccountSid": value["credentials"][0]["account_sid"],
        "CallSid": value["session"]["call_sid"],
        "To": value["phone"],
        "From": "+14155550100",
    }
    path = f"/twiml/{session}/{capability}"
    signed = RequestValidator("test-auth").compute_signature("https://voice.example" + path, form)
    with TestClient(create_app(config, FakeApi())) as client:
        assert client.post(path, data=form).status_code == 403
        response = client.post(path, data=form, headers={"X-Twilio-Signature": signed})
        assert response.status_code == 200
        assert "<Connect>" in response.text and "<Stream" in response.text
        assert "wss://voice.example/media/" in response.text
        assert "<Record" not in response.text and "recording" not in response.text.lower()
        assert response.headers["cache-control"] == "no-store"
        wrong = {**form, "To": "+919000000002"}
        signed_wrong = RequestValidator("test-auth").compute_signature(
            "https://voice.example" + path, wrong
        )
        assert (
            client.post(path, data=wrong, headers={"X-Twilio-Signature": signed_wrong}).status_code
            == 403
        )
    assert events[0][1]["status"] == "in-progress"


async def test_relay_clears_buffered_audio_before_network_or_tool_work():
    import asyncio

    from calmloop_voice.app import relay

    output = []
    cleared = asyncio.Event()
    queue = asyncio.Queue()

    class Phone:
        async def send_json(self, event):
            output.append(event)
            if event["event"] == "clear":
                cleared.set()

        async def receive_text(self):
            await cleared.wait()
            return json.dumps({"event": "stop"})

    class Agent:
        def __aiter__(self):
            return self

        async def __anext__(self):
            return await queue.get()

        async def send(self, value):
            pass

    class Api:
        async def request(self, session, action, body=None):
            if action == "generation":
                assert cleared.is_set()
            return {"saved": True}

    await queue.put(json.dumps({"type": "SettingsApplied"}))
    await queue.put(b"\xff" * 160)
    await queue.put(json.dumps({"type": "UserStartedSpeaking"}))
    await asyncio.wait_for(relay(Phone(), Agent(), Api(), "session", "call", "stream", "owner"), 2)
    assert [event["event"] for event in output] == ["media", "clear"]
