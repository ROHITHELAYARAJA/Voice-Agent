from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException, Request, Response, WebSocket
from twilio.request_validator import RequestValidator
from twilio.twiml.voice_response import VoiceResponse

from buddy.logging import configure_logging
from buddy.runtime import BuddyRuntime
from config import Settings


def create_app(settings: Settings | None = None, runtime: BuddyRuntime | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    runtime = runtime or BuddyRuntime(settings)

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        await runtime.start()
        try:
            yield
        finally:
            await runtime.close()

    application = FastAPI(
        title="Buddy voice bridge",
        version="1.0.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    application.state.runtime = runtime

    async def verified_form(request: Request):
        if not settings.twilio_auth_token or not settings.public_url:
            raise HTTPException(503, "Phone integration is not configured.")
        if (
            request.headers.get("content-type", "").split(";")[0]
            != "application/x-www-form-urlencoded"
        ):
            raise HTTPException(415, "Expected a Twilio form request.")
        body = await request.body()
        if len(body) > 16384:
            raise HTTPException(413, "Request is too large.")
        form = await request.form()
        url = (
            settings.public_url
            + request.url.path
            + (f"?{request.url.query}" if request.url.query else "")
        )
        if not RequestValidator(settings.twilio_auth_token).validate(
            url, form, request.headers.get("x-twilio-signature", "")
        ):
            raise HTTPException(403, "Invalid Twilio signature.")
        if form.get("AccountSid") != settings.twilio_account_sid:
            raise HTTPException(403, "Twilio account mismatch.")
        return form

    @application.exception_handler(KeyError)
    async def not_found(request: Request, exc: KeyError):
        return Response(
            content='{"detail":"Check-in not found."}',
            status_code=404,
            media_type="application/json",
        )

    @application.get("/health")
    async def health():
        return {"status": "online", "service": "Buddy"}

    @application.post("/twiml")
    async def twiml(request: Request):
        form = await verified_form(request)
        session_id = request.query_params.get("session_id")
        response = VoiceResponse()
        if session_id:
            session = runtime.store.get(session_id)
            if form.get("To") != settings.owner_phone_number:
                raise HTTPException(403, "This call is not for the configured owner.")
            if session["call_sid"] and session["call_sid"] != form.get("CallSid"):
                raise HTTPException(403, "Call mismatch.")
        else:
            if (
                not settings.owner_phone_number
                or form.get("From") != settings.owner_phone_number
                or form.get("To") != settings.twilio_phone_number
            ):
                response.reject(reason="rejected")
                return Response(str(response), media_type="application/xml")
            session = runtime.new_session()
            session_id = session["id"]
        if session["status"] in {"completed", "declined"}:
            response.hangup()
            return Response(str(response), media_type="application/xml")
        runtime.store.update(session_id, call_sid=form.get("CallSid"), call_status="in-progress")
        stream = response.connect().stream(
            url=settings.public_url.replace("https://", "wss://") + "/media"
        )
        stream.parameter(name="session_id", value=session_id)
