from urllib.parse import parse_qs

import httpx
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from twilio.request_validator import RequestValidator

from buddy.runtime import BuddyRuntime
from buddy.sheets import IntegrationError
from main import create_app


def signed(settings, path, data):
    return {
        "X-Twilio-Signature": RequestValidator(settings.twilio_auth_token).compute_signature(
            settings.public_url + path, data
        )
    }


def test_no_ui_or_unsigned_phone_access(settings):
    with TestClient(create_app(settings)) as client:
        assert client.get("/health").json()["status"] == "online"
        for path in ("/", "/docs", "/redoc", "/static/index.html", "/api/calls"):
            assert client.get(path).status_code == 404
        assert client.post("/twiml", data={"CallSid": "CA123"}).status_code == 403
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/media"):
                pass


def test_signed_twiml_binds_session_and_hangup(settings):
    application = create_app(settings)
    with TestClient(application) as client:
        runtime = application.state.runtime
        session = runtime.new_session()
        runtime.store.update(session["id"], call_sid="CA123")
        path = f"/twiml?session_id={session['id']}"
        data = {
            "AccountSid": settings.twilio_account_sid,
            "CallSid": "CA123",
            "To": settings.owner_phone_number,
        }
        response = client.post(path, data=data, headers=signed(settings, path, data))
        assert response.status_code == 200
        assert 'url="wss://buddy.example.com/media"' in response.text
        assert 'name="session_id"' in response.text
        assert "<Hangup" in response.text
        data["To"] = "+14155559999"
        assert client.post(path, data=data, headers=signed(settings, path, data)).status_code == 403


def test_callbacks_cannot_regress_or_change_call(settings):
    application = create_app(settings)
    with TestClient(application) as client:
        runtime = application.state.runtime
        session = runtime.new_session()
        runtime.store.update(session["id"], call_sid="CA123", call_status="ringing")
        path = f"/call-status?session_id={session['id']}"
        data = {
            "AccountSid": settings.twilio_account_sid,
            "CallSid": "CA123",
            "CallStatus": "completed",
        }
        assert client.post(path, data=data, headers=signed(settings, path, data)).status_code == 204
        data["CallStatus"] = "ringing"
        client.post(path, data=data, headers=signed(settings, path, data))
        assert runtime.store.get(session["id"])["call_status"] == "completed"
        data["CallSid"] = "CA-other"
        assert client.post(path, data=data, headers=signed(settings, path, data)).status_code == 403


async def test_outbound_only_calls_owner_and_prevents_second_call(settings):
    requests = []

    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json={"type": "Full"})
        requests.append(parse_qs(request.content.decode()))
        return httpx.Response(201, json={"sid": "CA123", "status": "queued"})

    runtime = BuddyRuntime(settings)
    await runtime.http.aclose()
    runtime.http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    runtime.telephony.http = runtime.http
    try:
        session = await runtime.start_call()
        assert requests[0]["To"] == [settings.owner_phone_number]
        assert requests[0]["StatusCallbackEvent"] == [
            "initiated",
            "ringing",
            "answered",
            "completed",
        ]
        assert session["call_sid"] == "CA123"
        with pytest.raises(IntegrationError, match="already active"):
            await runtime.start_call()
        assert len(requests) == 1
    finally:
        await runtime.close()


def test_stream_token_and_call_binding(settings):
    runtime = BuddyRuntime(settings)
    session = runtime.new_session()
    runtime.store.update(session["id"], call_sid="CA123")
    start = {
        "accountSid": settings.twilio_account_sid,
        "callSid": "CA123",
        "streamSid": "MZ123",
        "mediaFormat": {"encoding": "audio/x-mulaw", "sampleRate": 8000, "channels": 1},
        "customParameters": {"session_id": session["id"], "stream_token": session["stream_token"]},
    }
    assert runtime.bridge.validate_start(start)["id"] == session["id"]
    start["customParameters"]["stream_token"] = "wrong"
    with pytest.raises(ValueError, match="token"):
        runtime.bridge.validate_start(start)
    import asyncio

    asyncio.run(runtime.close())


async def test_trial_uses_only_basic_fields_and_polls_terminal_status(settings, caplog):
    requests = []
    call_status = "queued"

    def handler(request):
        if request.url.path.endswith(f"/{settings.twilio_account_sid}.json"):
            return httpx.Response(200, json={"type": "Trial"})
        if request.method == "GET":
            return httpx.Response(200, json={"sid": "CA123", "status": call_status})
        requests.append(parse_qs(request.content.decode()))
        return httpx.Response(201, json={"sid": "CA123", "status": "queued"})

    runtime = BuddyRuntime(settings)
    await runtime.http.aclose()
    runtime.http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    runtime.telephony.http = runtime.http
    try:
        session = await runtime.start_call()
        assert requests == [
            {
                "To": [settings.owner_phone_number],
                "From": [settings.twilio_phone_number],
                "Url": [f"{settings.public_url}/twiml?session_id={session['id']}"],
            }
        ]
        assert "trial rules block Media Streams" in caplog.text
        version = session["version"]
        await runtime.refresh_call()
        assert runtime.store.get(session["id"])["version"] == version
        call_status = "ringing"
        await runtime.refresh_call()
        assert runtime.active_call()["call_status"] == "ringing"
        call_status = "queued"
        await runtime.refresh_call()
        assert runtime.active_call()["call_status"] == "ringing"
        call_status = "no-answer"
        await runtime.refresh_call()
        assert runtime.active_call() is None
        assert runtime.store.get(session["id"])["status"] == "interrupted"
        await runtime.start_call()
        assert len(requests) == 2
    finally:
        await runtime.close()


async def test_twilio_error_preserves_code_zero_and_hides_secrets(settings):
    from buddy.telephony import TwilioClient

    def handler(request):
        return httpx.Response(
            400,
            json={
                "code": 0,
                "message": "Invalid or disallowed parameters - " + settings.twilio_auth_token,
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        with pytest.raises(IntegrationError) as error:
            await TwilioClient(settings, http).request("Calls.json", {})
        message = str(error.value)
        assert "HTTP 400, code 0" in message
        assert "Invalid or disallowed parameters" in message
        assert "[hidden]" in message
        assert settings.twilio_auth_token not in message


async def test_call_creation_does_not_retry_on_lost_response(settings):
    from buddy.telephony import TwilioClient

    requests = []

    def handler(request):
        requests.append(request)
        raise httpx.ReadTimeout("Lost response", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        client = TwilioClient(settings, http)
        client.account_type = "Trial"
        with pytest.raises(IntegrationError, match="Check the call status"):
            await client.call_owner("checkin-1")
    assert len(requests) == 1
