import asyncio
import base64
import json
import logging
import os
import time
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from uuid import uuid4

import httpx
import websockets
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.responses import Response
from twilio.request_validator import RequestValidator
from twilio.twiml.voice_response import VoiceResponse

from buddy.bridge import VoiceBridge

from .conversation import Conversation, agent_settings
from .security import credentials, validate_handshake, validate_stream, verify_capability

logger = logging.getLogger("CALMLOOP_VOICE")


@dataclass(frozen=True)
class Environment:
    api_url: str
    public_url: str
    service_secret: str
    session_secret: str

    @classmethod
    def read(cls):
        load_dotenv(".env.calmloop")
        values = [
            os.environ[name]
            for name in (
                "API_INTERNAL_URL",
                "VOICE_PUBLIC_URL",
                "INTERNAL_SERVICE_SECRET",
                "VOICE_SESSION_SECRET",
            )
        ]
        if (
            not values[1].startswith("https://")
            or not (values[0].startswith("https://") or values[0].startswith("http://127.0.0.1:"))
            or any(len(value) < 32 for value in values[2:])
        ):
            raise ValueError("Secure voice service configuration required")
        return cls(*values)


class ProductApi:
    def __init__(self, env: Environment, http: httpx.AsyncClient):
        self.env, self.http = env, http

    async def request(self, session: str, action: str, body: dict | None = None):
        url = f"{self.env.api_url.rstrip('/')}/internal/voice/{session}/{action}"
        response = await self.http.request(
            "GET" if body is None else "POST",
            url,
            headers={"Authorization": f"Bearer {self.env.service_secret}"},
            json=body,
        )
        response.raise_for_status()
        return response.json()


def create_app(env: Environment | None = None, supplied_api=None):
    @asynccontextmanager
    async def lifespan(application):
        application.state.env = env or Environment.read()
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as http:
            application.state.product = supplied_api or ProductApi(application.state.env, http)
            yield

    application = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    @application.get("/health")
    async def health():
        return {"status": "ready", "service": "calmloop-voice"}

    async def authorized(request: Request, session: str, capability: str, callback: bool = False):
        config = application.state.env
        try:
            verify_capability(capability, session, config.session_secret)
            context = await application.state.product.request(
                session, "context?callback=1" if callback else "context"
            )
            twilio = credentials(context, "twilio")
            form = await request.form()
            url = config.public_url.rstrip("/") + request.url.path
            if not RequestValidator(twilio["auth_token"]).validate(
                url, form, request.headers.get("x-twilio-signature", "")
            ):
                raise ValueError("Invalid signature")
            call = form.get("CallSid", "")
            if (
                form.get("AccountSid") != twilio["account_sid"]
                or not str(call).startswith("CA")
                or context["session"]["call_sid"] not in (None, call)
            ):
                raise ValueError("Invalid call association")
            if form.get("To") != context["phone"] or form.get("From") != (
                context["session"].get("caller_number") or twilio["caller_number"]
            ):
                raise ValueError("Invalid phone association")
            return form, context
        except (ValueError, KeyError, httpx.HTTPError):
            raise HTTPException(403, "Call could not be authorized") from None

    @application.post("/twiml/{session}/{capability}")
    async def twiml(request: Request, session: str, capability: str):
        form, _ = await authorized(request, session, capability)
        await application.state.product.request(
            session, "event", {"call_sid": form["CallSid"], "status": "in-progress"}
        )
        response = VoiceResponse()
        base = application.state.env.public_url.rstrip("/").replace("https://", "wss://", 1)
        stream = response.connect().stream(url=f"{base}/media/{session}/{capability}")
        stream.parameter(name="session_id", value=session)
        stream.parameter(name="capability", value=capability)
        response.hangup()
        return Response(
            str(response), media_type="application/xml", headers={"Cache-Control": "no-store"}
        )

    @application.post("/status/{session}/{capability}")
    async def status(request: Request, session: str, capability: str):
        form, _ = await authorized(request, session, capability, callback=True)
        mapped = "initiated" if form.get("CallStatus") == "queued" else form.get("CallStatus")
        try:
            await application.state.product.request(
                session, "event", {"call_sid": form["CallSid"], "status": mapped}
            )
        except httpx.HTTPStatusError as error:
            if error.response.status_code != 409:
                raise HTTPException(503, "Status update unavailable") from None
        return Response(status_code=204)

    @application.websocket("/media/{session}/{capability}")
    async def media(socket: WebSocket, session: str, capability: str):
        config = application.state.env
        owner = str(uuid4())
        claimed = False
        failure = None
        try:
            verify_capability(capability, session, config.session_secret)
            context = await application.state.product.request(session, "context")
            public = config.public_url.rstrip("/") + socket.url.path
            if not validate_handshake(
                public,
                socket.headers.get("x-twilio-signature", ""),
                credentials(context, "twilio")["auth_token"],
            ):
                await socket.close(code=1008)
                return
            await socket.accept()
            start = await VoiceBridge.start_message(None, socket)
            validate_stream(start, context, session, capability)
            await application.state.product.request(session, "lease", {"owner": owner})
            claimed = True
            async with websockets.connect(
                "wss://agent.deepgram.com/v1/agent/converse",
                additional_headers={
                    "Authorization": f"Token {credentials(context, 'deepgram')['api_key']}"
                },
                open_timeout=15,
                close_timeout=3,
                max_size=2**20,
                max_queue=16,
            ) as agent:
                await agent.send(json.dumps(agent_settings(context), ensure_ascii=False))
                await relay(
                    socket,
                    agent,
                    application.state.product,
                    session,
                    start["callSid"],
                    start["streamSid"],
                    owner,
                )
        except Exception:
            failure = "VOICE_CONNECTION_ENDED"
            logger.warning("Voice session ended before normal completion")
        finally:
            if claimed:
                with suppress(Exception):
                    await application.state.product.request(
                        session, "lease", {"owner": owner, "release": True}
                    )
            with suppress(Exception):
                await socket.close()
            if claimed:
                with suppress(Exception):
                    await application.state.product.request(
                        session,
                        "event",
                        {
                            "call_sid": start["callSid"],
                            "status": "completed",
                            "error_code": failure,
                        },
                    )

    return application


async def relay(socket, agent, product, session, call_sid, stream_sid, owner):
    state = Conversation()
    ready = asyncio.Event()
    finished = asyncio.Event()
    write_lock = asyncio.Lock()
    tool_tasks = set()
    canceled = set()
    last_speech = time.monotonic()
    last_context = 0.0
    end_mark = None
    output_allowed = True
    seen = {}

    async def send(value):
        async with write_lock:
            await socket.send_json({"streamSid": stream_sid, **value})

    async def execute(function, generation):
        name, identifier = function.get("name"), function.get("id")
        try:
            if identifier in seen:
                result = seen[identifier]
            elif generation != state.generation or identifier in canceled or state.speaking:
                return
            else:
                args = function.get("arguments", "{}")
                args = json.loads(args) if isinstance(args, str) else args
                if name == "confirm_permission":
                    state.confirm_permission(args["quote"])
                    await product.request(
                        session,
                        "event",
                        {"call_sid": call_sid, "status": "in-progress", "spoken_consent": True},
                    )
                    result = {"ok": True, "next": "Ask how today felt, once."}
                elif name == "prepare_reflection":
                    result = {"ok": True, **state.prepare(args)}
                elif name == "save_reflection":
                    await product.request(session, "reflection", state.reflection(args["approval"]))
                    state.saved = True
                    result = {"ok": True, "saved": True}
                elif name == "end_call":
                    state.closed = True
                    result = {"ok": True, "end_call": True}
                else:
                    raise ValueError("Unknown action")
                seen[identifier] = result
        except (ValueError, KeyError, httpx.HTTPError) as error:
            result = {
                "ok": False,
                "error": str(error)
                if isinstance(error, (ValueError, KeyError))
                else "The save did not complete; don't claim it was saved.",
            }
        if generation == state.generation and identifier not in canceled:
            await agent.send(
                json.dumps(
                    {
                        "type": "FunctionCallResponse",
                        "id": identifier,
                        "name": name,
                        "content": json.dumps(result, ensure_ascii=False),
                    }
                )
            )

    async def from_agent():
        nonlocal output_allowed, last_speech, end_mark
        async for raw in agent:
            if isinstance(raw, bytes):
                if output_allowed and not state.speaking:
                    await send(
                        {"event": "media", "media": {"payload": base64.b64encode(raw).decode()}}
                    )
                continue
            event = json.loads(raw)
            kind = event.get("type")
            if kind == "SettingsApplied":
                ready.set()
            elif kind == "UserStartedSpeaking":
                await send({"event": "clear"})
                state.interrupt()
                output_allowed = False
                end_mark = None
                last_speech = time.monotonic()
                for task in list(tool_tasks):
                    task.cancel()
                await product.request(session, "generation", {"generation": state.generation})
            elif kind == "AgentThinking":
                output_allowed = not state.speaking
            elif kind == "ConversationText":
                if event.get("role") == "user":
                    state.remember(event.get("content", ""))
                    last_speech = time.monotonic()
                    if re_stop(state.turns[-1]):
                        finished.set()
                else:
                    output_allowed = not state.speaking
            elif kind == "FunctionCallCancelled":
                canceled.update(f.get("id") for f in event.get("functions", []))
                for task in list(tool_tasks):
                    if getattr(task, "function_id", None) in canceled:
                        task.cancel()
            elif kind == "FunctionCallRequest":
                for function in event.get("functions", []):
                    if function.get("client_side") is False:
                        continue
                    task = asyncio.create_task(execute(function, state.generation))
                    task.function_id = function.get("id")
                    tool_tasks.add(task)
                    task.add_done_callback(tool_tasks.discard)
            elif kind == "AgentAudioDone":
                mark = state.playback_mark()
                if mark:
                    await send({"event": "mark", "mark": {"name": mark}})
                if state.closed:
                    end_mark = f"end-{state.generation}"
                    await send({"event": "mark", "mark": {"name": end_mark}})
            elif kind == "Error":
                raise ValueError("Provider rejected settings or connection")
        finished.set()

    async def from_phone():
        while not finished.is_set():
            event = json.loads(await socket.receive_text())
            if event.get("event") == "media":
                await asyncio.wait_for(ready.wait(), 20)
                value = base64.b64decode(event["media"]["payload"], validate=True)
                if len(value) > 16000:
                    raise ValueError("Oversized audio frame")
                if event["media"].get("track", "inbound") == "inbound":
                    await agent.send(value)
            elif event.get("event") == "mark":
                name = event.get("mark", {}).get("name")
                state.acknowledge(name)
                if end_mark and name == end_mark:
                    finished.set()
            elif event.get("event") == "stop":
                finished.set()

    async def supervise():
        nonlocal last_context
        async with asyncio.timeout(600):
            while not finished.is_set():
                now = time.monotonic()
                if now - last_speech > 75:
                    finished.set()
                    return
                if now - last_context > 15:
                    await product.request(session, "context")
                    await product.request(session, "lease", {"owner": owner})
                    last_context = now
                await agent.send(json.dumps({"type": "KeepAlive"}))
                try:
                    await asyncio.wait_for(finished.wait(), 5)
                except TimeoutError:
                    pass

    tasks = [asyncio.create_task(coro()) for coro in (from_agent, from_phone, supervise)]
    stop = asyncio.create_task(finished.wait())
    try:
        done, _ = await asyncio.wait([*tasks, stop], return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
    finally:
        for task in [*tasks, stop, *tool_tasks]:
            task.cancel()
        await asyncio.gather(*tasks, stop, *tool_tasks, return_exceptions=True)
        state.turns.clear()
        state.draft = None


def re_stop(text):
    from .conversation import permission

    return permission(text) is False and any(
        word in text.lower() for word in ("stop", "end call", "cancel", "நிறுத்த", "வேண்டாம்")
    )


app = create_app()
