import argparse
import asyncio
import os
import sys
import time
from dotenv import load_dotenv

load_dotenv()

import ngrok


async def start_tunnel_async(port: int = 8000, domain: str = None):
    token = os.getenv("NGROK_AUTHTOKEN")
    if not token:
        print("NGROK_AUTHTOKEN not found in environment or .env file.")
        sys.exit(1)

    forward_kwargs = {
        "addr": f"localhost:{port}",
        "authtoken_from_env": True,
    }
    if domain:
        forward_kwargs["domain"] = domain

    res = ngrok.forward(**forward_kwargs)
    if asyncio.iscoroutine(res) or isinstance(res, asyncio.Task):
        forwarder = await res
    else:
        forwarder = res

    public_url = forwarder.url()
    ws_url = public_url.replace("https://", "wss://").replace("http://", "ws://")

    return {
        "forwarder": forwarder,
        "url": public_url,
        "ws_url": ws_url,
        "port": port,
    }


def start_tunnel(port: int = 8000, domain: str = None):
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        return start_tunnel_async(port, domain)

    token = os.getenv("NGROK_AUTHTOKEN")
    if not token:
        print("NGROK_AUTHTOKEN not found in environment or .env file.")
        sys.exit(1)

    forward_kwargs = {
        "addr": f"localhost:{port}",
        "authtoken_from_env": True,
    }
    if domain:
        forward_kwargs["domain"] = domain

    forwarder = ngrok.forward(**forward_kwargs)
    public_url = forwarder.url()
    ws_url = public_url.replace("https://", "wss://").replace("http://", "ws://")

    return {
        "forwarder": forwarder,
        "url": public_url,
        "ws_url": ws_url,
        "port": port,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Local tunnel manager with ngrok."
    )
    parser.add_argument(
        "--port",
        "-p",
        type=int,
        default=8000,
        help="Local port to forward",
    )
    parser.add_argument(
        "--domain",
        "-d",
        type=str,
        default=None,
        help="Optional ngrok domain",
    )

    args = parser.parse_args()

    try:
        tunnel = start_tunnel(port=args.port, domain=args.domain)
        print(f"Public HTTPS URL: {tunnel['url']}")
        print(f"Public WSS URL: {tunnel['ws_url']}")
        print("Forwarding active. Press Ctrl+C to stop.")

        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        ngrok.disconnect()
        print("Tunnel closed.")
    except Exception as exc:
        print(f"Failed to start tunnel: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
