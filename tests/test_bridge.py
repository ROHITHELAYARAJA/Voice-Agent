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

