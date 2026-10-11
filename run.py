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
                    event = json.loads(await asyncio.wait_for(agent.recv(), timeout=10))
                    if event.get("type") != "Welcome":
                        raise ValueError("Missing welcome event")
                    logging.getLogger("DEEPGRAM").info(
                        "API key accepted | Voice Agent WebSocket connected"
                    )
            except Exception:
                logging.getLogger("DEEPGRAM").error(
                    "Authentication check failed; inspect the Deepgram key and network"
                )
                ok = False
        else:
            ok = False
        if settings.elevenlabs_api_key:
            try:
                response = await http.get(
                    f"https://api.elevenlabs.io/v1/voices/{settings.tts_voice}",
                    headers={"xi-api-key": settings.elevenlabs_api_key},
                )
                response.raise_for_status()
                voice = response.json().get("name", "")
                logging.getLogger("ELEVENLABS").info(
                    "Voice accessible | %s", voice or "configured voice"
                )
                if "jessica" not in voice.lower():
                    logging.getLogger("ELEVENLABS").warning(
                        "The configured voice is not named Jessica. Check TTS_VOICE_ID."
                    )
            except (httpx.HTTPError, ValueError):
                logging.getLogger("ELEVENLABS").error(
                    "Jessica voice check failed; check the ElevenLabs key and voice access"
                )
                ok = False
        else:
            logging.getLogger("ELEVENLABS").warning(
                "Voice access cannot be checked until ELEVENLABS_API_KEY is configured"
            )
            ok = False
        if settings.twilio_account_sid and settings.twilio_auth_token:
            try:
                response = await http.get(
                    f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}.json",
                    auth=(settings.twilio_account_sid, settings.twilio_auth_token),
                )
                response.raise_for_status()
                logging.getLogger("TWILIO").info("Account credentials accepted")
            except httpx.HTTPError:
                logging.getLogger("TWILIO").error(
                    "Account check failed; inspect Twilio credentials"
                )
                ok = False
        if not settings.missing_sheet_settings():
            try:
                await SheetsClient(settings, http).request(
                    "GET", params={"fields": "spreadsheetId"}
                )
                logging.getLogger("SHEETS").info(
                    "Google authentication accepted | spreadsheet accessible"
                )
            except IntegrationError as exc:
