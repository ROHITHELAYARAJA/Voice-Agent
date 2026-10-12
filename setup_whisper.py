import argparse
import asyncio
import json
from pathlib import Path

from buddy.logging import configure_logging
from buddy.whisper_stt import WhisperSTT
from config import Settings


async def main():
    parser = argparse.ArgumentParser(description="Prepare local OpenAI Whisper for Tamil speech")
    parser.add_argument(
        "--audio", type=Path, help="Optionally transcribe a mono PCM16 WAV of at most 30 seconds"
    )
    args = parser.parse_args()
    settings = Settings.from_env()
    configure_logging(settings.timezone)
    recognizer = WhisperSTT(settings)
    await recognizer.check()
    if args.audio:
        text = await recognizer.transcribe_file(args.audio)
        print(
            json.dumps(
                {
                    "language": settings.conversation_language,
                    "text": text,
                    "device": recognizer.device,
                },
                ensure_ascii=False,
            )
        )
    else:
        print(
            "Whisper is ready locally. Telephone audio needs CALL_MODE=stream, STREAM_STT_PROVIDER=whisper and a Twilio account with Media Streams access."
        )


if __name__ == "__main__":
    asyncio.run(main())
