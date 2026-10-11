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
