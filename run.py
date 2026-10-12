import argparse
import asyncio
import json
import logging
import sys
import threading

import uvicorn

from buddy.excel import ExcelClient
from buddy.logging import configure_logging
from buddy.runtime import BuddyRuntime
from buddy.sheets import IntegrationError, SheetsClient
from config import Settings
from main import create_app
from tunnel import start_tunnel_async

logger = logging.getLogger("SYSTEM")


def print_status(settings: Settings) -> None:
    logger.info("Buddy | terminal-only daily voice check-in")
    if settings.call_mode == "gather":
        ai = (
            settings.llm_model + " via Deepgram"
            if settings.gather_ai_provider == "deepgram"
            else "local " + settings.local_model
        )
        voice = (
            "ElevenLabs Jessica (" + settings.tts_model + ") via Deepgram"
            if settings.phone_voice_provider == "eleven_labs"
            else settings.phone_voice
        )
        logger.info("Listen: Twilio speech | Think: %s | Speak: %s", ai, voice)
        logger.info("Call mode: one question at a time | trial-compatible Gather + Play")
    else:
        logger.info(
            "Listen: "
            + (
                "local Whisper Tamil"
                if settings.stream_stt_provider == "whisper"
                else "Deepgram Flux"
            )
            + " | Think: %s | Speak: ElevenLabs Jessica (%s)",
            settings.llm_model,
            settings.tts_model,
        )
    if (
        settings.gather_ai_provider == "deepgram"
        or settings.phone_voice_provider == "eleven_labs"
        or settings.call_mode == "stream"
    ):
        logger.info(
            "Deepgram usage applies to your project credits; trial phone usage remains with Twilio"
        )
    logger.info(
        "Language: %s | recognition: %s | local Whisper on telephone requires Media Streams",
        settings.conversation_language,
        settings.phone_language,
    )
    logger.info("Timezone: %s | Currency: %s", settings.timezone, settings.currency)
    missing = settings.missing_call_settings()
    logger.info(
        "Phone settings: %s", "ready" if not missing else "setup needed: " + ", ".join(missing)
    )
    if settings.sheet_backend == "excel":
        logger.info("Storage: local Excel | %s | no Google credentials needed", settings.excel_path)
    else:
        missing = settings.missing_google_settings()
        logger.info(
            "Storage: Google Sheets | %s",
            "configured; access is checked during sync"
            if not missing
            else "setup needed: " + ", ".join(missing),
        )


async def live_check(settings: Settings) -> bool:
    runtime = BuddyRuntime(settings)
    ok = True
    try:
        account = await runtime.telephony.check_account()
        logging.getLogger("TWILIO").info("Account accepted | %s", account)
        if settings.call_mode == "stream" and account == "Trial":
            raise IntegrationError(
                "Twilio trial blocks Media Streams. Use CALL_MODE=gather with Deepgram and Jessica."
            )
        if settings.call_mode == "gather":
            await runtime.phone.check()
        else:
            await runtime.phone.voice.prewarm(["Hello. This is Buddy, your AI check-in companion."])
            from buddy.deepgram_ai import DeepgramAI

            agent = DeepgramAI(settings, runtime.http)
            try:
                await agent.check()
            finally:
                await agent.close()
        if settings.sheet_backend == "excel":
            await ExcelClient(settings).initialize(runtime.store)
            logging.getLogger("SHEETS").info("Excel ready | %s", settings.excel_path)
        elif settings.missing_google_settings():
            raise IntegrationError("Google Sheets settings are missing")
        else:
            await SheetsClient(settings, runtime.http).request(
                "GET", params={"fields": "spreadsheetId"}
            )
    except IntegrationError as exc:
        logger.error("%s", exc)
        ok = False
    finally:
        await runtime.phone.close()
        await runtime.http.aclose()
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
                    "%s | %s | %s | call %s | Spreadsheet %s",
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


async def console(runtime: BuddyRuntime, server: uvicorn.Server) -> None:
    queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def read_input():
        while not server.should_exit:
            try:
                line = input()
            except (EOFError, OSError):
                loop.call_soon_threadsafe(queue.put_nowait, None)
                return
            loop.call_soon_threadsafe(queue.put_nowait, line)
            if line.strip().lower() in {"quit", "exit"}:
                return

    threading.Thread(target=read_input, daemon=True, name="buddy-console").start()
    help_commands()
    while not server.should_exit:
        line = await queue.get()
        if line is None:
            logger.info("Terminal input closed; the bridge stays online until Ctrl+C")
            await asyncio.Future()
        if not await command(runtime, line):
            server.should_exit = True
            return


async def serve(settings: Settings, args) -> int:
    runtime = BuddyRuntime(settings)
    server = uvicorn.Server(
        uvicorn.Config(
            create_app(settings, runtime),
            host="127.0.0.1",
            port=settings.port,
            proxy_headers=False,
            ws_max_size=65536,
            access_log=False,
            log_config=None,
        )
    )
    server_task = asyncio.create_task(server.serve())
    tunnel = None
    console_task = None
    try:
        async with asyncio.timeout(15):
            while not server.started:
                if server_task.done():
                    await server_task
                    raise IntegrationError(
                        "The server could not start. Check whether its port is already in use."
                    )
                await asyncio.sleep(0.05)
        if not args.no_tunnel:
            tunnel = await start_tunnel_async(settings.port, args.domain)
            settings.public_hostname = tunnel["url"]
            logging.getLogger("NGROK").info(
                "Connected | %s → 127.0.0.1:%s", tunnel["url"], settings.port
            )
            logging.getLogger("NGROK").info("Incoming-call webhook: %s/twiml", settings.public_url)
        print_status(settings)
        if args.call or args.resume:
            try:
                await runtime.start_call(args.resume)
            except IntegrationError:
                logger.warning(
                    "The call did not start. Buddy and ngrok remain online; use call to retry after fixing the reported issue."
                )
        if not args.non_interactive:
            console_task = asyncio.create_task(console(runtime, server))
        await server_task
        return 0
    except (IntegrationError, TimeoutError) as exc:
        logger.error("%s", str(exc) or "Startup timed out")
        return 1
    finally:
        server.should_exit = True
        if console_task:
            console_task.cancel()
            await asyncio.gather(console_task, return_exceptions=True)
        if not server_task.done():
            await server_task
        if tunnel:
            await tunnel["forwarder"].close()
            logging.getLogger("NGROK").info("Tunnel closed")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Buddy terminal voice check-ins: Twilio + local AI + Excel"
    )
    parser.add_argument(
        "--call", action="store_true", help="Call your configured number after startup"
    )
    parser.add_argument(
        "--resume", metavar="CHECKIN_ID", help="Call and resume an unfinished check-in"
    )
    parser.add_argument(
        "--no-tunnel",
        action="store_true",
        help="Use an already running PUBLIC_HOSTNAME instead of opening ngrok",
    )
    parser.add_argument("--domain", help="Optional reserved ngrok domain")
    parser.add_argument(
        "--non-interactive", action="store_true", help="Run with logs and no command prompt"
    )
    parser.add_argument(
        "--doctor",
        action="store_true",
        help="Check configuration without starting a server or placing a call",
    )
    parser.add_argument(
        "--live-check",
        action="store_true",
        help="With --doctor, verify provider access without placing a call",
    )
    args = parser.parse_args()
    if args.call and args.resume:
        parser.error("Choose --call or --resume, not both")
    if args.live_check and not args.doctor:
        parser.error("--live-check requires --doctor")
    try:
        settings = Settings.from_env()
        configure_logging(settings.timezone)
        if args.doctor:
            print_status(settings)
            live_ok = asyncio.run(live_check(settings)) if args.live_check else True
            return (
                0
                if not settings.missing_call_settings()
                and not settings.missing_sheet_settings()
                and live_ok
                else 1
            )
        return asyncio.run(serve(settings, args))
    except KeyboardInterrupt:
        logger.info("Buddy stopped. Saved check-ins remain on disk.")
        return 0
    except Exception as exc:
        logger.error(
            "Startup failed (%s). Check configuration, the network and ngrok account access.",
            type(exc).__name__,
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
