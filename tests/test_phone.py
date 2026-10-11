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
