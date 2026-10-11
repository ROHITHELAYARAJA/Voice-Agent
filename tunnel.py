import argparse
import asyncio
import logging
import os

import ngrok
from dotenv import load_dotenv

from buddy.logging import configure_logging
from buddy.sheets import IntegrationError
from config import ROOT

load_dotenv(ROOT / ".env")
logger = logging.getLogger("NGROK")


async def start_tunnel_async(port: int = 8000, domain: str | None = None) -> dict:
    if not os.getenv("NGROK_AUTHTOKEN"):
        raise IntegrationError("NGROK_AUTHTOKEN is missing. Run uv run python setup.py.")
    options = {"addr": f"127.0.0.1:{port}", "authtoken_from_env": True}
    if domain:
        options["domain"] = domain
    try:
        forwarder = await ngrok.forward(**options)
    except Exception:
        raise IntegrationError(
            "ngrok could not open the tunnel. Check its token, account limits, network and reserved domain."
        ) from None
    return {"forwarder": forwarder, "url": forwarder.url(), "port": port}


async def serve(port: int, domain: str | None) -> None:
    tunnel = await start_tunnel_async(port, domain)
    logger.info("Connected | %s → 127.0.0.1:%s", tunnel["url"], port)
    try:
        await asyncio.Future()
    finally:
        await tunnel["forwarder"].close()
        logger.info("Tunnel closed")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Standalone ngrok tunnel. Use run.py to run the full Buddy agent."
    )
    parser.add_argument("--port", "-p", type=int, default=8000)
    parser.add_argument("--domain", "-d")
    args = parser.parse_args()
    configure_logging("Asia/Kolkata")
    try:
        asyncio.run(serve(args.port, args.domain))
    except KeyboardInterrupt:
        pass
    except IntegrationError as exc:
        logger.error("%s", exc)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
