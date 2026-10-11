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

