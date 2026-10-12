import asyncio
import base64
import json
import logging
import secrets
import time

from fastapi import WebSocketDisconnect

from buddy.bridge import VoiceBridge
from buddy.models import AnswerInput, CompleteInput, EndInput, MoneyEntry, Section
from buddy.sheets import IntegrationError
from buddy.stream_audio import MulawDecoder, SpeechGate, telephone_audio
from buddy.whisper_stt import WhisperSTT

logger = logging.getLogger("WHISPER CALL")


class WhisperBridge(VoiceBridge):
    def __init__(self, runtime):
        super().__init__(runtime.settings, runtime.store, runtime.checkin, runtime.sheets)
        self.phone = runtime.phone
        self.stt = WhisperSTT(runtime.settings)

    async def check(self):
        if self.settings.phone_voice_provider != "eleven_labs":
            raise IntegrationError("Whisper calls require PHONE_VOICE_PROVIDER=eleven_labs")
        await self.stt.check()
        await self.phone.check()

    async def run(self, websocket):
        await websocket.accept()
        session_id = None
        claimed = False
        error = None
        try:
            start = await self.start_message(websocket)
            session = self.validate_start(start)
            session_id = session["id"]
            self.active_sessions.add(session_id)
            claimed = True
            if self.stt.model is None:
                raise IntegrationError("Whisper must be prepared before dialing")
            self.store.update(session_id, call_status="in-progress")
            logger.info("Local Tamil recognition connected | %s", start["callSid"])
            await self.relay_local(websocket, session_id, start["streamSid"])
        except WebSocketDisconnect:
            pass
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            error = "Whisper call interrupted: " + type(exc).__name__
            logger.warning("%s; saved answers remain available", error)
        finally:
            if claimed:
                self.active_sessions.discard(session_id)
                if self.store.get(session_id)["status"] not in {"completed", "declined"}:
                    self.checkin.end(
                        session_id, EndInput(reason=error or "Call ended before confirmation")
                    )
                self.store.update(session_id, call_status="completed", call_error=error)
                self.sync.wake.set()
                await self.phone.ai.close()
            try:
                await websocket.close()
            except RuntimeError:
                pass

    async def relay_local(self, twilio, session_id, stream_sid, gate=None):
        gate = gate or SpeechGate()
        decoder = MulawDecoder()
        state = self.checkin.state(session_id)
        phase = "consent" if state["next_section"] == "consent" else "resume_consent"
        generation = 0
        speaking = False
        review_ready = False
        fragments = []
        clarification_count = 0
        play_task = inference_task = None
        closed = asyncio.Event()
        incoming = asyncio.Queue(maxsize=4)
        send_lock = asyncio.Lock()
        marks = {}
        last_activity = time.monotonic()

        async def send(message):
            async with send_lock:
                await twilio.send_json({"streamSid": stream_sid, **message})

        async def playback_mark(epoch):
            name = "buddy-" + secrets.token_hex(12)
            event = asyncio.Event()
            marks[name] = (epoch, event)
            await send({"event": "mark", "mark": {"name": name}})
            await asyncio.wait_for(event.wait(), timeout=10)
            marks.pop(name, None)
            return epoch == generation and not speaking

        async def play(texts, target, epoch, ending=None):
            nonlocal phase, clarification_count, review_ready, last_activity
            activated = False
            try:
                for index, text in enumerate(texts):
                    if epoch != generation or speaking:
                        return
                    self.phone.voice.prepare(text)
                    if text in self.phone.voice.cache:
                        wav = self.phone.voice.cache[text]
                    else:
                        wav = await asyncio.wait_for(
                            asyncio.shield(self.phone.voice.jobs[text]), 12
                        )
                    audio = telephone_audio(wav)
                    for offset in range(0, len(audio), 160):
                        if epoch != generation or speaking:
                            return
                        if not activated:
                            if target != phase:
                                fragments.clear()
                                clarification_count = 0
                                review_ready = False
                            phase = target
                            activated = True
                        await send(
                            {
                                "event": "media",
                                "media": {
                                    "payload": base64.b64encode(
                                        audio[offset : offset + 160]
                                    ).decode()
                                },
                            }
                        )
                        last_activity = time.monotonic()
                        await asyncio.sleep(0.02)
                    self.store.transcript(session_id, "assistant", text)
                    self.sync.wake.set()
                    if target == "review" and index == len(texts) - 2:
                        review_ready = await playback_mark(epoch)
                if ending and await playback_mark(epoch):
                    await asyncio.sleep(0.15)
                    if epoch != generation or speaking:
                        return
                    if ending == "complete":
                        self.checkin.complete(session_id, CompleteInput(confirmed=True))
                    elif ending == "decline" and phase == "consent":
                        self.checkin.answer(
                            session_id,
                            AnswerInput(
                                section="consent", answer="Declined by caller", consent=False
                            ),
                        )
                    else:
                        self.checkin.end(
                            session_id, EndInput(reason="Caller ended the conversation")
                        )
                    self.sync.wake.set()
                    closed.set()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("Playback paused safely | %s", type(exc).__name__)
                closed.set()

        def say(texts, target, epoch, ending=None):
            nonlocal play_task, review_ready
            if target == "review" and len(texts) > 1:
                review_ready = False
            if play_task and not play_task.done():
                play_task.cancel()
            play_task = asyncio.create_task(play(texts, target, epoch, ending))

        def next_prompt(epoch, corrected=False):
            current = self.checkin.state(session_id)
            target = phase if corrected else current["next_section"]
            if target == "review":
                say(self.phone.summary_parts(session_id), target, epoch)
            else:
                say([self.phone.questions[target]], target, epoch)

        async def interpret(epoch):
            nonlocal clarification_count
            latest = fragments[-1]
            if phase in {"consent", "resume_consent"}:
                accepted = self.phone.permission(latest)
                if accepted is None:
                    clarification_count += 1
                    if clarification_count > 1:
                        say([self.phone.DECLINE], phase, epoch, "stop")
                    else:
                        say(
                            [self.phone.CONSENT if phase == "consent" else self.phone.RESUME],
                            phase,
                            epoch,
                        )
                elif not accepted:
                    say([self.phone.DECLINE], phase, epoch, "decline")
                else:
                    if phase == "consent":
                        self.checkin.answer(
                            session_id, AnswerInput(section="consent", answer=latest, consent=True)
                        )
                    next_prompt(epoch)
                return
            if phase == "review" and self.phone.permission(latest) is True:
                if not review_ready:
                    say(self.phone.summary_parts(session_id), phase, epoch)
                    return
                say([self.phone.COMPLETE], phase, epoch, "complete")
                return
            current = self.checkin.state(session_id)
            answers = {name: dict(value) for name, value in current["answers"].items()}
            for name, field in (("spending", "expenses"), ("income", "income")):
                if name in answers:
                    answers[name]["entries"] = current[field]
            context = [
                {
                    "role": "assistant",
                    "content": self.phone.questions.get(phase, self.phone.REVIEW_CONFIRM),
                }
            ]
            context.extend({"role": "user", "content": text} for text in fragments[:-1])
            result = await self.phone.ai.interpret(
                phase, latest, answers, timeout=8, context=context
            )
            if epoch != generation or speaking:
                return
            if result.action == "stop":
                say([self.phone.STOP], phase, epoch, "stop")
            elif result.action == "clarify":
                if phase == "review":
                    clarification_count += 1
                    if clarification_count > 1:
                        say([self.phone.REVIEW_PAUSE], phase, epoch, "stop")
                    else:
                        say([self.phone.REVIEW_CONFIRM], phase, epoch)
                elif clarification_count == 0:
                    clarification_count += 1
                    say([self.phone.CLARIFICATIONS[phase]], phase, epoch)
                else:
                    prior = current["answers"].get(phase, {}).get("answer", "")
                    entries = [
                        MoneyEntry.model_validate(entry)
                        for entry in answers.get(phase, {}).get("entries", [])
                    ]
                    self.checkin.answer(
                        session_id,
                        AnswerInput(
                            section=Section(phase),
                            answer=("Unclear: " + prior + " " + "; ".join(fragments))[:5000],
                            entries=entries,
                            details_complete=phase not in {"spending", "income"},
                        ),
                    )
                    next_prompt(epoch)
            else:
                target = result.section.value if result.section else phase
                if (
                    result.action == "record"
                    and target != phase
                    or result.action == "correct"
                    and target not in answers
                ):
                    raise ValueError("Invalid answer target")
                if phase == "review" and result.action != "correct" or target == "consent":
                    say([self.phone.REVIEW_CONFIRM], phase, epoch)
                    return
                self.checkin.answer(
                    session_id,
                    AnswerInput(
                        section=Section(target),
                        answer=result.answer,
                        entries=result.entries,
                        skipped=result.skipped,
                        details_complete=result.details_complete,
                    ),
                )
                self.sync.wake.set()
                logger.info("Saved | %s", target)
                next_prompt(epoch, corrected=result.action == "correct")

        async def infer(epoch):
            try:
                await interpret(epoch)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("Answer processing paused | %s", type(exc).__name__)
                if epoch == generation:
                    say([self.phone.MODEL_ERROR], phase, epoch, "stop")

        async def receive():
            nonlocal generation, speaking, inference_task, last_activity
            while not closed.is_set():
                event = json.loads(await twilio.receive_text())
                if event.get("event") == "stop":
                    closed.set()
                    return
                if event.get("event") == "mark":
                    mark = marks.get(event.get("mark", {}).get("name"))
                    if mark and mark[0] == generation:
                        mark[1].set()
                if (
                    event.get("event") != "media"
                    or event.get("media", {}).get("track", "inbound") != "inbound"
                ):
                    continue
                payload = base64.b64decode(event["media"]["payload"], validate=True)
                if len(payload) > 16000:
                    raise ValueError("Oversized audio frame")
                for kind, pcm in gate.feed(decoder.decode(payload)):
                    if kind == "start":
                        generation += 1
                        speaking = True
                        review_ready_before_clear = review_ready
                        if play_task:
                            play_task.cancel()
                        if inference_task:
                            inference_task.cancel()
                        marks.clear()
                        await send({"event": "clear"})
                        last_activity = time.monotonic()
                        logger.info(
                            "Caller speaking | Jessica stopped | generation %s | review heard %s",
                            generation,
                            review_ready_before_clear,
                        )
                    else:
                        speaking = False
                        if kind == "utterance":
                            incoming.put_nowait((generation, pcm))
                        elif kind == "silence":
                            texts = (
                                self.phone.summary_parts(session_id)
                                if phase == "review"
                                else [
                                    self.phone.CONSENT
                                    if phase == "consent"
                                    else self.phone.RESUME
                                    if phase == "resume_consent"
                                    else self.phone.questions[phase]
                                ]
                            )
                            say(texts, phase, generation)

        async def recognize():
            nonlocal inference_task, last_activity, clarification_count
            while not closed.is_set():
                epoch, pcm = await incoming.get()
                text = await self.stt.transcribe(pcm)
                if not text:
                    if epoch == generation and not speaking:
                        clarification_count += 1
                        if clarification_count > 1:
                            say([self.phone.SILENCE], phase, epoch, "stop")
                        else:
                            say(
                                [self.phone.CLARIFICATIONS.get(phase, self.phone.CONSENT)],
                                phase,
                                epoch,
                            )
                    continue
                self.store.transcript(session_id, "user", text)
                self.sync.wake.set()
                fragments.append(text)
                last_activity = time.monotonic()
                logger.info("You: %s", text)
                if epoch == generation and not speaking and incoming.empty():
                    if inference_task:
                        await asyncio.gather(inference_task, return_exceptions=True)
                    inference_task = asyncio.create_task(infer(epoch))

        async def supervise():
            while not closed.is_set():
                await asyncio.sleep(1)
                if time.monotonic() - last_activity > self.settings.silence_timeout_seconds:
                    closed.set()

        say([self.phone.CONSENT if phase == "consent" else self.phone.RESUME], phase, generation)
        tasks = [
            asyncio.create_task(receive()),
            asyncio.create_task(recognize()),
            asyncio.create_task(supervise()),
            asyncio.create_task(closed.wait()),
        ]
        try:
            async with asyncio.timeout(self.settings.max_call_seconds):
                done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    task.result()
        finally:
            for task in [*tasks, play_task, inference_task]:
                if task:
                    task.cancel()
            await asyncio.gather(
                *(task for task in [*tasks, play_task, inference_task] if task),
                return_exceptions=True,
            )
