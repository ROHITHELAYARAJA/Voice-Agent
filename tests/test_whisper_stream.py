import asyncio
import base64
import importlib
import io
import wave
from unittest.mock import AsyncMock

import pytest

from buddy.local_ai import Interpretation
from buddy.models import AnswerInput, Section
from buddy.runtime import BuddyRuntime
from tests.test_bridge import FakeTwilio

np = pytest.importorskip("numpy")
stream_audio = importlib.import_module("buddy.stream_audio")
SpeechGate, decode_mulaw, encode_mulaw = (
    stream_audio.SpeechGate,
    stream_audio.decode_mulaw,
    stream_audio.encode_mulaw,
)


def test_audio_conversion_and_vad_wait_for_sustained_speech():
    assert len(decode_mulaw(b"\xff" * 160)) == 640
    assert encode_mulaw(np.zeros(160, dtype=np.int16)) == b"\xff" * 160
    detector = type("Detector", (), {"is_speech": lambda self, frame, rate: True})()
    gate = SpeechGate(detector)
    frame = (np.ones(320, dtype="<i2") * 1500).tobytes()
    assert gate.feed(frame) == []
    assert gate.feed(frame) == []
    assert gate.feed(frame) == [("start", None)]
    gate.feed(frame * 8)
    events = gate.feed(bytes(640 * 35))
    assert events[0][0] == "utterance" and len(events[0][1]) > 5120
    assert not gate.active


def test_stream_decoder_keeps_continuity_across_phone_packets():
    samples = np.linspace(-10000, 10000, 320, dtype=np.int16)
    encoded = encode_mulaw(samples)
    whole = stream_audio.MulawDecoder().decode(encoded)
    decoder = stream_audio.MulawDecoder()
    assert decoder.decode(encoded[:160]) + decoder.decode(encoded[160:]) == whole
    assert decoder.decode(b"") == b""


async def until(predicate):
    async with asyncio.timeout(2):
        while not predicate():
            await asyncio.sleep(0.005)


def wav(seconds=1):
    out = io.BytesIO()
    with wave.open(out, "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(24000)
        file.writeframes((np.ones(int(24000 * seconds), dtype="<i2") * 1500).tobytes())
    return out.getvalue()


async def test_user_onset_stops_jessica_before_whisper_finishes(settings):
    settings.stream_stt_provider = "whisper"
    settings.phone_voice_provider = "eleven_labs"
    runtime = BuddyRuntime(settings)
    session = runtime.new_session()
    runtime.phone.voice.cache[runtime.phone.CONSENT] = wav()
    runtime.bridge.stt.transcribe = AsyncMock(side_effect=lambda pcm: asyncio.sleep(2))
    twilio = FakeTwilio()
    gate = type("Gate", (), {"feed": lambda self, pcm: [("start", None)]})()
    task = asyncio.create_task(runtime.bridge.relay_local(twilio, session["id"], "MZ123", gate))
    try:
        await until(lambda: any(event["event"] == "media" for event in twilio.sent))
        twilio.events.put_nowait(
            {"event": "media", "media": {"payload": base64.b64encode(b"\xff" * 160).decode()}}
        )
        await until(lambda: any(event["event"] == "clear" for event in twilio.sent))
        count = sum(event["event"] == "media" for event in twilio.sent)
        await asyncio.sleep(0.08)
        assert sum(event["event"] == "media" for event in twilio.sent) == count
        runtime.bridge.stt.transcribe.assert_not_awaited()
        assert runtime.store.get(session["id"])["answers"] == {}
    finally:
        twilio.events.put_nowait({"event": "stop"})
        await task
        await runtime.close()


async def test_late_old_audio_is_not_played_after_an_interruption(settings):
    settings.stream_stt_provider = "whisper"
    settings.phone_voice_provider = "eleven_labs"
    runtime = BuddyRuntime(settings)
    session = runtime.new_session()
    audio = asyncio.Future()
    runtime.phone.voice.prepare = lambda text: None
    runtime.phone.voice.jobs[runtime.phone.CONSENT] = audio
    twilio = FakeTwilio()
    gate = type("Gate", (), {"feed": lambda self, pcm: [("start", None)]})()
    task = asyncio.create_task(runtime.bridge.relay_local(twilio, session["id"], "MZ123", gate))
    try:
        await asyncio.sleep(0.02)
        twilio.events.put_nowait(
            {"event": "media", "media": {"payload": base64.b64encode(b"\xff" * 160).decode()}}
        )
        await until(lambda: any(event["event"] == "clear" for event in twilio.sent))
        audio.set_result(wav(0.05))
        await asyncio.sleep(0.05)
        assert not any(event["event"] == "media" for event in twilio.sent)
    finally:
        twilio.events.put_nowait({"event": "stop"})
        await task
        await runtime.close()


async def test_interrupted_inference_cannot_save_stale_answers(settings):
    settings.stream_stt_provider = "whisper"
    settings.phone_voice_provider = "eleven_labs"
    runtime = BuddyRuntime(settings)
    session = runtime.new_session()
    runtime.checkin.answer(
        session["id"], AnswerInput(section="consent", answer="Yes", consent=True)
    )
    for text in [
        runtime.phone.RESUME,
        *runtime.phone.questions.values(),
        runtime.phone.MODEL_ERROR,
    ]:
        runtime.phone.voice.cache[text] = wav(0.2)
    runtime.bridge.stt.transcribe = AsyncMock(side_effect=["Yes", "First answer", "Latest answer"])
    started = asyncio.Event()

    async def interpret(section, speech, answers, **kwargs):
        if speech == "First answer":
            started.set()
            try:
                await asyncio.sleep(10)
            except asyncio.CancelledError:
                return Interpretation(action="record", section=section, answer="STALE ANSWER")
        return Interpretation(action="record", section=section, answer="Latest answer")

    runtime.phone.ai.interpret = interpret
    twilio = FakeTwilio()
    gate = type(
        "Gate", (), {"feed": lambda self, pcm: [("start", None), ("utterance", b"fake-pcm")]}
    )()
    task = asyncio.create_task(runtime.bridge.relay_local(twilio, session["id"], "MZ123", gate))

    def utterance():
        twilio.events.put_nowait(
            {"event": "media", "media": {"payload": base64.b64encode(b"\xff" * 160).decode()}}
        )

    try:
        await until(lambda: any(event["event"] == "media" for event in twilio.sent))
        utterance()
        await until(lambda: len(runtime.store.transcripts(session["id"])) >= 2)
        await asyncio.sleep(0.05)
        utterance()
        await asyncio.wait_for(started.wait(), 2)
        utterance()
        await until(lambda: "accomplishments" in runtime.store.get(session["id"])["answers"])
        assert (
            runtime.store.get(session["id"])["answers"]["accomplishments"]["answer"]
            == "Latest answer"
        )
        assert any(
            row["content"] == "First answer" for row in runtime.store.transcripts(session["id"])
        )
    finally:
        twilio.events.put_nowait({"event": "stop"})
        await task
        await runtime.close()


async def test_interrupting_review_before_it_is_heard_cannot_confirm_completion(settings):
    settings.stream_stt_provider = "whisper"
    settings.phone_voice_provider = "eleven_labs"
    runtime = BuddyRuntime(settings)
    session = runtime.new_session()
    for section in Section:
        runtime.checkin.answer(
            session["id"],
            AnswerInput(
                section=section,
                answer="Yes" if section == Section.CONSENT else "No updates",
                consent=True if section == Section.CONSENT else None,
            ),
        )
    texts = [runtime.phone.RESUME, *runtime.phone.summary_parts(session["id"])]
    for text in texts:
        runtime.phone.voice.cache[text] = wav(0.8)
    runtime.bridge.stt.transcribe = AsyncMock(return_value="Yes")
    twilio = FakeTwilio()
    gate = type(
        "Gate", (), {"feed": lambda self, pcm: [("start", None), ("utterance", b"fake-pcm")]}
    )()
    task = asyncio.create_task(runtime.bridge.relay_local(twilio, session["id"], "MZ123", gate))

    def utterance():
        twilio.events.put_nowait(
            {"event": "media", "media": {"payload": base64.b64encode(b"\xff" * 160).decode()}}
        )

    try:
        await until(lambda: any(event["event"] == "media" for event in twilio.sent))
        utterance()
        await asyncio.sleep(0.05)
        utterance()
        await asyncio.sleep(0.05)
        assert runtime.store.get(session["id"])["status"] == "review"
    finally:
        twilio.events.put_nowait({"event": "stop"})
        await task
        await runtime.close()
