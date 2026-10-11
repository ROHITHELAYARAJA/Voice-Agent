import asyncio
import base64
import json
import uvicorn
import websockets
from fastapi import FastAPI, Request, Response, WebSocket

from config import (
    AGENT_SETTINGS,
    DEEPGRAM_API_KEY,
    DEEPGRAM_WS_URL,
    PORT,
    PUBLIC_HOSTNAME,
)

app = FastAPI(title="Voice-Agent")


def sts_connect():
    if not DEEPGRAM_API_KEY:
        raise ValueError("DEEPGRAM_API_KEY not found in environment")

    return websockets.connect(
        DEEPGRAM_WS_URL,
        subprotocols=["token", DEEPGRAM_API_KEY],
        open_timeout=30,
    )


async def agent_to_twilio(twilio_ws: WebSocket, agent_ws, stream_sid_box: dict) -> None:
    try:
        while True:
            message = await agent_ws.recv()
            sid = stream_sid_box.get("sid")

            if isinstance(message, bytes):
                payload = base64.b64encode(message).decode("utf-8")
                await twilio_ws.send_text(
                    json.dumps({
                        "event": "media",
                        "streamSid": sid,
                        "media": {"payload": payload},
                    })
                )
            else:
                data = json.loads(message)
                event_type = data.get("type")

                if event_type == "UserStartedSpeaking":
                    await twilio_ws.send_text(
                        json.dumps({
                            "event": "clear",
                            "streamSid": sid,
                        })
                    )
                elif event_type == "ConversationText":
                    role = data.get("role", "unknown")
                    content = data.get("content", "")
                    print(f"[{role}] {content}")
    except (websockets.exceptions.ConnectionClosed, asyncio.CancelledError):
        pass


@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "Twilio-Deepgram Voice Agent",
        "public_host": PUBLIC_HOSTNAME,
    }


@app.post("/twiml")
async def twiml(request: Request) -> Response:
    host = PUBLIC_HOSTNAME.replace("https://", "").replace("http://", "").strip("/")
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://{host}/media" />
  </Connect>
</Response>"""
    return Response(content=xml, media_type="application/xml")


@app.websocket("/media")
async def media(twilio_ws: WebSocket) -> None:
    await twilio_ws.accept()
    stream_sid_box: dict = {}

    async with sts_connect() as agent_ws:
        relay_task = asyncio.create_task(
            agent_to_twilio(twilio_ws, agent_ws, stream_sid_box)
        )

        try:
            while True:
                raw = await twilio_ws.receive_text()
                msg = json.loads(raw)
                event = msg.get("event")

                if event == "start":
                    stream_sid_box["sid"] = msg["start"]["streamSid"]
                    await agent_ws.send(json.dumps(AGENT_SETTINGS))
                elif event == "media":
                    payload = base64.b64decode(msg["media"]["payload"])
                    await agent_ws.send(payload)
                elif event == "stop":
                    break
        except Exception:
            pass
        finally:
            relay_task.cancel()


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
