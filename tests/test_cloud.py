import asyncio
import io
import json
import wave
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock
from urllib.parse import urlsplit

import pytest
from fastapi.testclient import TestClient

from buddy.deepgram_ai import DeepgramAI
from buddy.local_ai import Interpretation
from buddy.models import AnswerInput
from buddy.provider_schema import tool_schema
from buddy.runtime import BuddyRuntime
from buddy.sheets import IntegrationError
from buddy.telephony import TwilioClient
from buddy.voice_audio import VoiceAudio
from main import create_app
from tests.test_phone import signed


def test_managed_voice_needs_only_deepgram_key(settings):
    settings.call_mode = "gather"
    settings.gather_ai_provider = "deepgram"
    settings.phone_voice_provider = "eleven_labs"
    settings.elevenlabs_api_key = ""
    assert settings.missing_call_settings() == []
    settings.deepgram_api_key = ""
    assert "DEEPGRAM_API_KEY" in settings.missing_call_settings()


def test_gemini_tool_schema_is_inlined_and_server_remains_strict():
    value = tool_schema(AnswerInput.model_json_schema(), "google")
    encoded = json.dumps(value)
    assert "$ref" not in encoded and "$defs" not in encoded
    assert "additionalProperties" not in encoded
    assert value["properties"]["entries"]["items"]["properties"]["amount"]["type"] == "string"
    with pytest.raises(ValueError):
        AnswerInput(section="learning", answer="Learned Python", extra="invalid")


async def test_trial_streaming_is_rejected_before_call_creation(settings):
    runtime = BuddyRuntime(settings)
    runtime.telephony.check_account = AsyncMock(return_value="Trial")
    runtime.telephony.call_owner = AsyncMock()
    try:
        with pytest.raises(IntegrationError, match="no call was placed"):
            await runtime.start_call()
        runtime.telephony.call_owner.assert_not_awaited()
        assert runtime.store.list_sessions() == []
    finally:
        await runtime.close()


async def test_deepgram_interpretation_keeps_money_evidence_guard(settings):
    runtime = BuddyRuntime(settings)
    ai = DeepgramAI(settings, runtime.http)
    ai.generate = AsyncMock(
        return_value=Interpretation(
            action="record",
            section="spending",
            answer="Lunch 900 INR",
            entries=[{"description": "Lunch", "amount": "900", "currency": "INR"}],
        )
    )
    try:
        result = await ai.interpret("spending", "Lunch cost 120 rupees", {})
        assert result.action == "clarify"
        result = await ai.interpret("spending", "Stop this call", {})
        assert result.action == "stop"
        assert ai.generate.await_count == 1
    finally:
        await ai.close()
        await runtime.close()


def test_jessica_audio_is_opaque_bound_and_expires_after_resume(settings, monkeypatch):
    settings.call_mode = "gather"
    settings.phone_voice_provider = "eleven_labs"
    monkeypatch.setattr(
        TwilioClient, "get_call", AsyncMock(return_value={"sid": "CA123", "status": "in-progress"})
    )
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(24000)
        wav.writeframes(b"\0\0" * 2400)
    with TestClient(create_app(settings)) as client:
        runtime = client.app.state.runtime
        session = runtime.new_session()
        runtime.store.update(session["id"], call_sid="CA123", call_status="in-progress")
        runtime.phone.voice.cache[runtime.phone.CONSENT] = output.getvalue()
        runtime.phone.voice.cache[runtime.phone.SILENCE] = output.getvalue()
        path = f"/twiml?session_id={session['id']}"
        data = {
            "AccountSid": settings.twilio_account_sid,
            "CallSid": "CA123",
            "To": settings.owner_phone_number,
        }
        xml = client.post(path, data=data, headers=signed(settings, path, data)).text
        assert "<Play>" in xml and "<Say" not in xml and "<Stream" not in xml
        import xml.etree.ElementTree as ET

        url = ET.fromstring(xml).find("Gather/Play").text
        assert "check-in" not in url and settings.deepgram_api_key not in url
        audio_path = urlsplit(url).path
        response = client.get(audio_path)
        assert response.status_code == 200 and response.content[:4] == b"RIFF"
        assert response.headers["cache-control"] == "private, no-store"
        runtime.store.update(session["id"], call_sid="CA-resumed")
        assert client.get(audio_path).status_code == 404


async def test_deepgram_timeout_releases_the_connection(settings):
    runtime = BuddyRuntime(settings)
    ai = DeepgramAI(settings, runtime.http)
    connection = AsyncMock()

    async def receive():
        await asyncio.sleep(10)

    connection.recv = receive

    async def prepare():
        ai.connection = connection
        return connection

    ai.prepare = prepare
    try:
        with pytest.raises(IntegrationError, match="time limit"):
            ai.warm()
            await ai.warming
            await ai.generate("learning", "Learned Python", {}, 0.01, [])
        connection.close.assert_awaited()
    finally:
        await ai.close()
        await runtime.close()


async def test_static_voice_cache_survives_restart_without_private_answers(settings, monkeypatch):
    calls = []

    @asynccontextmanager
    async def connect(*args, **kwargs):
        calls.append(1)
        connection = AsyncMock()
        connection.recv = AsyncMock(
            side_effect=[b"\0\0" * 2400, json.dumps({"type": "AgentAudioDone"})]
        )
        yield connection

    monkeypatch.setattr("buddy.voice_audio.websockets.connect", connect)
    first = VoiceAudio(settings, None)
    second = VoiceAudio(settings, None)
    try:
        await first.prewarm(["Common question"])
        await second.prewarm(["Common question"])
        assert len(calls) == 1
        assert first.cache["Common question"] == second.cache["Common question"]
        await first.synthesize("A private answer from this call")
        assert len(calls) == 2
        assert len(list((settings.data_dir / "voice-cache").glob("*.wav"))) == 1
    finally:
        await first.close()
        await second.close()
