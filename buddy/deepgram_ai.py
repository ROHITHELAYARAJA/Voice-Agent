import asyncio
import json
import logging

import websockets
from websockets.exceptions import ConnectionClosed, WebSocketException

from buddy.agent import build_agent_settings
from buddy.bridge import DEEPGRAM_URL
from buddy.language import LANGUAGE_RULES
from buddy.local_ai import PROMPT, Interpretation, LocalAI
from buddy.provider_schema import tool_schema
from buddy.sheets import IntegrationError


class DeepgramAI(LocalAI):
    def __init__(self, settings, http):
        super().__init__(settings, http)
        self.logger = logging.getLogger("DEEPGRAM")
        self.connection = None
        self.warming = None
        self.keepalive = None

    def warm(self):
        if self.warming is None:
            self.warming = asyncio.create_task(self.prepare())

    async def prepare(self):
        payload = build_agent_settings(self.settings, {"date": "", "next_section": "consent"})
        payload["agent"].pop("greeting")
        payload["agent"]["think"]["prompt"] = (
            PROMPT + "\nMandatory: call interpret_answer exactly once for the supplied input. "
            "Use record for a new current_section answer. correct requires an explicit correction "
            "and a section that already exists in saved_answers. Supply every field, including empty fields. "
            "Do not speak or call another tool."
        )
        payload["agent"]["think"]["prompt"] += (
            "\n"
            + LANGUAGE_RULES
            + "\nConfigured response language: "
            + self.settings.conversation_language
        )
        payload["agent"]["think"]["functions"] = [
            {
                "name": "interpret_answer",
                "description": "Return the interpretation for server validation. No data is saved by this tool.",
                "parameters": tool_schema(
                    Interpretation.model_json_schema(), self.settings.llm_provider
                ),
            }
        ]
        connection = await websockets.connect(
            DEEPGRAM_URL,
            additional_headers={"Authorization": f"Token {self.settings.deepgram_api_key}"},
            open_timeout=10,
            close_timeout=0.1,
            max_size=1048576,
        )
        try:
            await connection.send(json.dumps(payload))
            async with asyncio.timeout(10):
                while True:
                    event = json.loads(await connection.recv())
                    if event["type"] == "Error":
                        raise ValueError("Deepgram settings rejected")
                    if event["type"] == "SettingsApplied":
                        self.connection = connection
                        self.keepalive = asyncio.create_task(self.keep_alive(connection))
                        return connection
        except BaseException:
            await connection.close()
            raise

    async def keep_alive(self, connection):
        try:
            while True:
                await asyncio.sleep(5)
                await connection.send(json.dumps({"type": "KeepAlive"}))
        except ConnectionClosed:
            return

    async def release(self):
        if self.keepalive:
            self.keepalive.cancel()
            await asyncio.gather(self.keepalive, return_exceptions=True)
            self.keepalive = None
        if self.connection:
            await self.connection.close()
            self.connection = None
        self.warming = None

    async def check(self):
        try:
            await self.close()
            self.warm()
            await self.warming
            result = await self.interpret("accomplishments", "Finished my project", {}, timeout=5)
            if result.action != "record" or result.section.value != "accomplishments":
                raise ValueError("Model readiness probe failed")
            await self.warming
            self.ready = True
            self.logger.info(
                "Voice Agent model ready | %s | structured answer validation enabled",
                self.settings.llm_model,
            )
        except Exception:
            await self.close()
            raise IntegrationError(
                "Deepgram is not ready. Check the key, model access and remaining credits with --doctor --live-check."
            ) from None

    async def generate(self, section, speech, answers, timeout, context):
        try:
            self.warm()
            async with asyncio.timeout(timeout or self.settings.local_ai_timeout):
                connection = await asyncio.shield(self.warming)
                await connection.send(
                    json.dumps(
                        {
                            "type": "InjectUserMessage",
                            "content": json.dumps(
                                {
                                    "current_section": section,
                                    "currency": self.settings.currency,
                                    "saved_answers": answers,
                                    "context": context or [],
                                    "speech": speech,
                                },
                                ensure_ascii=False,
                            ),
                        }
                    )
                )
                while True:
                    message = await connection.recv()
                    if isinstance(message, bytes):
                        continue
                    event = json.loads(message)
                    if event["type"] == "Error":
                        self.logger.warning(
                            "Answer provider rejected the request | %s",
                            event.get("code", "unknown"),
                        )
                        raise ValueError("Deepgram model rejected answer")
                    if event["type"] == "FunctionCallRequest":
                        functions = event.get("functions", [])
                        if len(functions) != 1 or functions[0].get("name") != "interpret_answer":
                            raise ValueError("Unexpected interpretation tool")
                        arguments = functions[0].get("arguments", {})
                        return (
                            Interpretation.model_validate_json(arguments)
                            if isinstance(arguments, str)
                            else Interpretation.model_validate(arguments)
                        )
        except (TimeoutError, ValueError, WebSocketException):
            raise IntegrationError(
                "Deepgram could not safely interpret the answer within the call time limit. Your spoken text is retained."
            ) from None
        finally:
            if self.warming and not self.warming.done():
                self.warming.cancel()
                await asyncio.gather(self.warming, return_exceptions=True)
            await self.release()
            self.warm()

    async def close(self):
        if self.warming and not self.warming.done():
            self.warming.cancel()
            await asyncio.gather(self.warming, return_exceptions=True)
        elif self.warming:
            await asyncio.gather(self.warming, return_exceptions=True)
        await self.release()
