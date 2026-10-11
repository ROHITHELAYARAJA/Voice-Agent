import argparse
import asyncio
import os
import sys
import time
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

import ngrok


async def start_tunnel_async(port: int = 8000, domain: str = None):
    """
    Asynchronously starts an ngrok tunnel (safe to await inside an asyncio loop).
    """
    token = os.getenv("NGROK_AUTHTOKEN")
    if not token:
        print("[ERROR] NGROK_AUTHTOKEN not found in environment or .env file.")
        print("Please add NGROK_AUTHTOKEN=<your_token> to your .env file.")
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
    """
    Synchronously starts an ngrok tunnel forwarding to the specified local port.
    If called from an already-running asyncio loop, returns the coroutine to await.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        return start_tunnel_async(port, domain)

    token = os.getenv("NGROK_AUTHTOKEN")
    if not token:
        print("[ERROR] NGROK_AUTHTOKEN not found in environment or .env file.")
        print("Please add NGROK_AUTHTOKEN=<your_token> to your .env file.")
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
        description="Create a local tunnel connected with ngrok for Voice-Agent."
    )
    parser.add_argument(
        "--port",
        "-p",
        type=int,
        default=8000,
        help="Local port to forward (default: 8000)",
    )
    parser.add_argument(
        "--domain",
        "-d",
        type=str,
        default=None,
        help="Optional custom or reserved ngrok domain",
    )

    args = parser.parse_args()

    print("\n" + "=" * 55)
    print(" 🚀 Starting Ngrok Local Tunnel")
    print("=" * 55)
    print(f" Target Local Port : http://localhost:{args.port}")

    try:
        tunnel = start_tunnel(port=args.port, domain=args.domain)
        print("-" * 55)
        print(f" 🌐 Public HTTPS URL : {tunnel['url']}")
        print(f" 🎙️  Public WSS URL   : {tunnel['ws_url']}")
        print("-" * 55)
        print(" Tunnel is active! Forwarding requests to localhost...")
        print(" Press Ctrl+C to close the tunnel.\n")

        # Keep running until user terminates
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\n[!] Shutting down ngrok tunnel...")
        ngrok.disconnect()
        print("[✓] Tunnel closed cleanly.")
    except Exception as e:
        print(f"\n[ERROR] Failed to start tunnel: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
