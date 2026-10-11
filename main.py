import asyncio
import os
import sys
from dotenv import load_dotenv
from websockets.asyncio.server import serve
import websockets

from tunnel import start_tunnel_async

# Load environment variables
load_dotenv()

PORT = int(os.getenv("PORT", 8000))


async def voice_handler(websocket):
    """
    Handles incoming WebSocket connections for real-time voice / audio streaming.
    """
    remote_addr = websocket.remote_address
    print(f"[+] Client connected from {remote_addr}")

    try:
        # Send welcome message
        await websocket.send("Connected to Voice-Agent!")

        async for message in websocket:
            if isinstance(message, bytes):
                # Binary audio data received (e.g. PCM, μ-law, Opus)
                print(f"[Audio] Received {len(message)} bytes of audio data")
                await websocket.send(f"ACK: Received {len(message)} audio bytes")
            else:
                # Text / JSON event
                print(f"[Event] Received message: {message}")
                await websocket.send(f"Echo: {message}")

    except websockets.exceptions.ConnectionClosed:
        print(f"[-] Client {remote_addr} disconnected.")
    except Exception as e:
        print(f"[!] Error in voice connection: {e}")


async def main():
    print("\n" + "=" * 60)
    print(" 🎙️  VOICE AGENT SERVER & NGROK TUNNEL")
    print("=" * 60)
    print(f" Starting local WebSocket server on localhost:{PORT}...")

    # Start the ngrok tunnel asynchronously
    tunnel = await start_tunnel_async(port=PORT)

    print("-" * 60)
    print(f" 🌐 Public HTTPS URL : {tunnel['url']}")
    print(f" 🔗 Public WSS URL   : {tunnel['ws_url']}")
    print("-" * 60)
    print(" Server is ready and publicly accessible!")
    print(" Press Ctrl+C to stop.\n")

    # Start WebSocket server
    async with serve(voice_handler, "localhost", PORT):
        # Keep running
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[!] Shutting down Voice Agent server and tunnel...")
        sys.exit(0)
