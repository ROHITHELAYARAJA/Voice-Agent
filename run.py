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
                logging.getLogger("SHEETS").error("%s", exc)
                ok = False
    return ok


def help_commands() -> None:
    logger.info(
        "Commands: call | resume <check-in-id> | hangup | status | list | show <check-in-id> | sync | help | quit"
    )


async def command(runtime: BuddyRuntime, line: str) -> bool:
    parts = line.strip().split(maxsplit=1)
    if not parts:
        return True
    action = parts[0].lower()
    argument = parts[1] if len(parts) > 1 else None
    try:
        if action == "call" and not argument:
            await runtime.start_call()
        elif action == "resume" and argument:
            await runtime.start_call(argument)
        elif action == "hangup" and not argument:
            await runtime.hangup()
        elif action == "status":
            print_status(runtime.settings)
            active = runtime.active_call()
            logger.info(
                "Active call: %s", f"{active['id']} | {active['call_status']}" if active else "none"
            )
        elif action == "list":
            sessions = runtime.store.list_sessions(20)
            for session in sessions:
                logger.info(
                    "%s | %s | %s | call %s | Sheets %s",
                    session["id"],
                    session["checkin_date"],
                    session["status"],
                    session["call_status"],
                    runtime.checkin.state(session["id"])["sheets_status"],
                )
            if not sessions:
                logger.info("No check-ins yet. Use call to begin.")
        elif action == "show" and argument:
            logger.info(
                "%s", json.dumps(runtime.checkin.state(argument), ensure_ascii=False, indent=2)
            )
        elif action == "sync":
            runtime.store.retry_sync()
            logger.info("Sync result: %s", await runtime.sheets.flush())
        elif action == "help":
            help_commands()
        elif action in {"quit", "exit"}:
            return False
        else:
            logger.warning("Unknown command or missing argument")
            help_commands()
    except (IntegrationError, KeyError, ValueError) as exc:
        logger.error("%s", str(exc))
    return True
