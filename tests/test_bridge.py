import asyncio
import base64
import json

from buddy.models import Section
from buddy.runtime import BuddyRuntime


class FakeAgent:
    def __init__(self):
        self.events = asyncio.Queue()
        self.sent = []

    def __aiter__(self):
        return self

    async def __anext__(self):
        return await self.events.get()

    async def send(self, message):
        self.sent.append(message)

    def event(self, event):
        self.events.put_nowait(json.dumps(event))


class FakeTwilio:
    def __init__(self):
        self.events = asyncio.Queue()
        self.sent = []

    async def receive_text(self):
        return json.dumps(await self.events.get())

    async def send_json(self, message):
        self.sent.append(message)
        if message["event"] == "mark":
            assert any(item["event"] == "media" for item in self.sent)
            self.events.put_nowait({"event": "mark", "mark": message["mark"]})


async def test_full_call_relay_records_answers_and_waits_for_playback(settings):
    runtime = BuddyRuntime(settings)
    try:
        session = runtime.new_session()
        twilio = FakeTwilio()
        agent = FakeAgent()
        twilio.events.put_nowait(
            {"event": "media", "media": {"payload": base64.b64encode(b"caller-audio").decode()}}
        )
        agent.event({"type": "SettingsApplied"})
        agent.event({"type": "ConversationText", "role": "user", "content": "Yes, let's do it"})
        agent.event({"type": "UserStartedSpeaking"})
        for index, section in enumerate(Section):
            arguments = {
                "section": section.value,
                "answer": "Yes" if section == Section.CONSENT else "No updates",
            }
            if section == Section.CONSENT:
                arguments["consent"] = True
            agent.event(
                {
                    "type": "FunctionCallRequest",
                    "functions": [
                        {
                            "id": str(index),
                            "name": "record_answer",
                            "arguments": json.dumps(arguments),
                            "client_side": True,
                        }
                    ],
                }
            )
        agent.event(
            {
                "type": "FunctionCallRequest",
                "functions": [
                    {
                        "id": "complete",
                        "name": "complete_checkin",
                        "arguments": '{"confirmed":true}',
                        "client_side": True,
                        "thought_signature": "test-signature",
                    }
                ],
            }
        )
        agent.events.put_nowait(b"goodbye-audio")
        agent.event(
            {
                "type": "FunctionCallRequest",
                "functions": [
                    {
                        "id": "end",
                        "name": "end_conversation",
                        "arguments": "{}",
                        "client_side": True,
                    }
                ],
            }
        )
        agent.event({"type": "AgentAudioDone"})
        await asyncio.wait_for(
            runtime.bridge.relay(twilio, agent, session["id"], "MZ123"), timeout=5
        )
        assert runtime.checkin.state(session["id"])["status"] == "completed"
        assert any(event["event"] == "clear" for event in twilio.sent)
        assert twilio.sent[-1]["event"] == "mark"
        assert all(event["streamSid"] == "MZ123" for event in twilio.sent)
        responses = [
            json.loads(message)
            for message in agent.sent
            if isinstance(message, str) and "FunctionCallResponse" in message
        ]
        assert len(responses) == 10
        assert (
            next(item for item in responses if item["id"] == "complete")["thought_signature"]
            == "test-signature"
        )
        assert len(runtime.store.transcripts(session["id"])) == 1
    finally:
        await runtime.close()


async def test_deepgram_error_stops_relay_without_hanging(settings):
    runtime = BuddyRuntime(settings)
    try:
        session = runtime.new_session()
        agent = FakeAgent()
        agent.event({"type": "Error", "code": "INVALID_SETTINGS"})
        import pytest

        with pytest.raises(ValueError, match="rejected"):
            await asyncio.wait_for(
                runtime.bridge.relay(FakeTwilio(), agent, session["id"], "MZ123"), timeout=3
            )
    finally:
        await runtime.close()
