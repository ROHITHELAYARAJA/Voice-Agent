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
