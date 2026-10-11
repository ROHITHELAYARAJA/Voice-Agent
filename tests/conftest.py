from unittest.mock import AsyncMock

import pytest

from buddy.telephony import TwilioClient
from config import Settings


@pytest.fixture(autouse=True)
def no_shutdown_network(monkeypatch):
    monkeypatch.setattr(TwilioClient, "hangup", AsyncMock())


@pytest.fixture
def settings(tmp_path):
    return Settings(
        data_dir=tmp_path / "data",
        deepgram_api_key="test-deepgram",
        elevenlabs_api_key="test-elevenlabs",
        public_hostname="https://buddy.example.com",
        twilio_account_sid="AC" + "a" * 32,
        twilio_auth_token="test-auth-token",
        twilio_phone_number="+14155550100",
        owner_phone_number="+919876543210",
    )
