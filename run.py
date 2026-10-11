import argparse
import asyncio
import json
import logging
import sys
import threading

import httpx
import uvicorn
import websockets

from buddy.bridge import DEEPGRAM_URL
from buddy.logging import configure_logging
from buddy.runtime import BuddyRuntime
from buddy.sheets import IntegrationError, SheetsClient
from config import Settings
from main import create_app
from tunnel import start_tunnel_async

logger = logging.getLogger("SYSTEM")


def print_status(settings: Settings) -> None:
    logger.info("Buddy | terminal-only daily voice check-in")
    logger.info(
        "Listen: Deepgram Flux | Think: %s | Speak: ElevenLabs Jessica (%s)",
        settings.llm_model,
        settings.tts_model,
    )
    logger.info("Timezone: %s | Currency: %s", settings.timezone, settings.currency)
    missing = settings.missing_call_settings()
    logger.info("Phone: %s", "ready" if not missing else "setup needed: " + ", ".join(missing))
    missing = settings.missing_sheet_settings()
    logger.info(
        "Sheets: %s",
        "configured; access is checked during sync"
        if not missing
        else "setup needed: " + ", ".join(missing),
    )


async def live_check(settings: Settings) -> bool:
    ok = True
    async with httpx.AsyncClient(timeout=20) as http:
        try:
            response = await http.get("https://agent.deepgram.com/v1/agent/settings/think/models")
            response.raise_for_status()

            def find_models(value):
                if isinstance(value, dict):
                    yield value
                    for item in value.values():
                        yield from find_models(item)
                elif isinstance(value, list):
                    for item in value:
                        yield from find_models(item)

            models = list(find_models(response.json()))
            available = any(
                model.get("id") == settings.llm_model
                and model.get("provider") == settings.llm_provider
                for model in models
            )
            logging.getLogger("DEEPGRAM").info(
                "Live model catalog: %s | %s",
                settings.llm_model,
                "available" if available else "not available",
            )
            ok = ok and available
        except (httpx.HTTPError, ValueError):
            logger.error("Could not check Deepgram's model catalog")
            ok = False
        if settings.deepgram_api_key:
            try:
                async with websockets.connect(
                    DEEPGRAM_URL,
                    additional_headers={"Authorization": f"Token {settings.deepgram_api_key}"},
                    open_timeout=15,
                    close_timeout=3,
                ) as agent:
