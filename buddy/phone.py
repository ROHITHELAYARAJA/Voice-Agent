import asyncio
import logging
import re

from twilio.twiml.voice_response import VoiceResponse

from buddy.deepgram_ai import DeepgramAI
from buddy.language import TAMIL_CLARIFICATIONS, TAMIL_LABELS, TAMIL_MESSAGES, TAMIL_QUESTIONS
from buddy.local_ai import Interpretation, LocalAI
from buddy.models import QUESTIONS, AnswerInput, CompleteInput, EndInput, Section
from buddy.sheets import IntegrationError
from buddy.voice_audio import VoiceAudio

logger = logging.getLogger("PHONE")


class PhoneConversation:
    CONSENT = "Hi, it's Buddy, your AI companion. Ready for a quick check-in?"
    RESUME = "Hi, it's Buddy. Ready to continue your check-in?"
    SILENCE = "I could not hear an answer. Your saved answers are safe. Goodbye."
    MODEL_ERROR = "Your answer is saved, but I couldn't process it safely. Let's pause here and continue another time. Goodbye."
    DECLINE = "No problem. We can do this another time. Goodbye."
    STOP = "No problem. Your saved answers are safe. We can continue another time. Goodbye."
    REVIEW_PAUSE = "Your check-in is saved as unfinished. We can review it another time. Goodbye."
    COMPLETE = (
        "Your check-in is complete and saved on your computer. Thanks for checking in. Goodbye."
    )
    REVIEW_START = "Here is your short summary. The full answers are saved on your computer."
    REVIEW_CONFIRM = "Is that correct, and may I finish saving it? Say yes or press 1 to confirm; say a correction, or press 2 to pause."
    CLARIFICATIONS = {
        "accomplishments": "What did you work on, even if you haven't finished it?",
        "learning": "What did you learn or practise? You can also say nothing today.",
        "spending": "What was the exact amount and what was it for? You can also say skip.",
        "income": "What money did you receive and how much? You can also say no income or skip.",
        "wellbeing": "How would you describe how you feel in a few words?",
        "tomorrow": "What would you like to work on tomorrow?",
        "notes": "What else would you like to remember? You can also say nothing else.",
    }

    def __init__(self, runtime):
        self.runtime = runtime
        self.settings = runtime.settings
        self.store = runtime.store
        self.checkin = runtime.checkin
        self.questions = {section.value: text for section, text in QUESTIONS.items()}
        if self.settings.conversation_language == "ta":
            for name, value in TAMIL_MESSAGES.items():
                setattr(self, name, value)
            self.questions.update(TAMIL_QUESTIONS)
            self.CLARIFICATIONS = TAMIL_CLARIFICATIONS
        self.ai = (DeepgramAI if self.settings.gather_ai_provider == "deepgram" else LocalAI)(
            self.settings, runtime.http
        )
        self.voice = VoiceAudio(self.settings, self.store)
        self.lock = asyncio.Lock()

    async def check(self):
        self.voice.tokens.clear()
        if self.settings.phone_voice_provider == "eleven_labs":
            await self.voice.prewarm(
                [
                    self.CONSENT,
                    self.RESUME,
                    self.SILENCE,
                    self.MODEL_ERROR,
                    self.DECLINE,
                    self.STOP,
                    self.REVIEW_PAUSE,
                    self.COMPLETE,
                    self.REVIEW_START,
                    self.REVIEW_CONFIRM,
                    *self.CLARIFICATIONS.values(),
                    *(text for section, text in self.questions.items() if section != "consent"),
                ]
            )
        await self.ai.check()

    async def close(self):
        await self.ai.close()
        await self.voice.close()

    def say(self, response, text: str, session_id: str) -> None:
        if self.settings.phone_voice_provider == "eleven_labs":
            response.play(self.voice.register(session_id, text))
        else:
            response.say(
                text, voice=self.settings.phone_voice, language=self.settings.phone_language
            )

    def finish(self, session_id: str, text: str, interrupt: bool = True) -> str:
        if interrupt:
            self.checkin.end(session_id, EndInput(reason=text))
        self.store.transcript(session_id, "assistant", text)
        self.runtime.sheets.wake.set()
        logger.info("Buddy: %s", text)
        response = VoiceResponse()
        self.say(response, text, session_id)
        response.hangup()
        return str(response)

    def summary_parts(self, session_id: str) -> list[str]:
        state = self.checkin.state(session_id)
        labels = {
            "accomplishments": "Progress",
            "learning": "Learning",
            "spending": "Spending",
            "income": "Income",
            "wellbeing": "Feeling",
            "tomorrow": "Tomorrow",
            "notes": "Other notes",
        }
        parts = [self.REVIEW_START]
        for section, label in labels.items():
            answer = state["answers"].get(section)
            if answer:
                detail = "skipped" if answer.get("skipped") else answer["answer"][:160]
                parts.append(f"{label}: {detail}.")
        for field, label in (
            ("spending_totals", "Confirmed spending"),
            ("income_totals", "Confirmed income"),
        ):
            if state[field]:
                parts.append(
                    label
                    + ": "
                    + ", ".join(f"{amount} {currency}" for currency, amount in state[field].items())
                    + "."
                )
        if state["incomplete_money_sections"]:
            parts.append("Some amounts are missing or estimated and are excluded from the totals.")
        parts.append(self.REVIEW_CONFIRM)
        return parts

    def summary(self, session_id: str) -> str:
        return " ".join(self.summary_parts(session_id))

    def question(
        self,
        session_id: str,
        call_sid: str,
        turn: int,
        section: str | None = None,
        prompt: str | None = None,
    ) -> str:
        state = self.checkin.state(session_id)
        section = section or state["next_section"]
        if state["status"] in {"completed", "declined"}:
            return self.finish(session_id, "Your check-in is closed. Goodbye.", interrupt=False)
        if turn >= self.settings.gather_max_turns:
            return self.finish(
                session_id,
                "We have reached this call's question limit. Everything captured is saved. Please resume this check-in from the terminal when you are ready. Goodbye.",
            )
        if prompt is None:
            if section == "review":
                prompt = self.summary(session_id)
            elif section == "resume_consent":
                prompt = self.RESUME
            elif section == "consent":
                prompt = self.CONSENT
            else:
                prompt = self.questions[section]
        response = VoiceResponse()
        action = f"{self.settings.public_url}/answer?session_id={session_id}&turn={turn}"
        if self.runtime.telephony.account_type == "Trial":
            action += "&webhook_token=" + self.store.get(session_id)["stream_token"]
        gather_kwargs = {
            "input": "speech dtmf",
            "action": action,
            "method": "POST",
            "language": self.settings.phone_language,
            "speech_timeout": self.settings.phone_speech_timeout,
            "timeout": 8,
            "num_digits": 1,
            "action_on_empty_result": True,
        }
        if self.settings.phone_speech_model and self.settings.phone_speech_model != "default":
            gather_kwargs["speech_model"] = self.settings.phone_speech_model
        gather = response.gather(**gather_kwargs)
        if (
            section == "review"
            and prompt == self.summary(session_id)
            and self.settings.phone_voice_provider == "eleven_labs"
        ):
            for part in self.summary_parts(session_id):
                self.say(gather, part, session_id)
        else:
            self.say(gather, prompt, session_id)
        self.say(response, self.SILENCE, session_id)
        response.hangup()
        saved = self.store.open_phone_turn(
            call_sid, turn, session_id, section, prompt, str(response)
        )
        self.runtime.sheets.wake.set()
        logger.info("Buddy: %s", saved["question"])
        return saved["xml"]

    def begin(self, session_id: str, call_sid: str) -> str:
        try:
            return self.store.phone_turn(call_sid, 0)["xml"]
        except KeyError:
            pass
        state = self.checkin.state(session_id)
        section = "consent" if state["next_section"] == "consent" else "resume_consent"
        return self.question(session_id, call_sid, 0, section)

    @staticmethod
    def permission(speech: str) -> bool | None:
        value = re.sub(r"[^a-z0-9 ]", " ", speech.lower()).strip()
        if value == "1":
            return True
        if value == "2":
            return False
        if re.search(r"\b(but|except|change|correction|actually|wait)\b", value) or re.search(
            r"ஆனால்|திருத்த|மாற்ற|மாற்றம்|பொறுங்கள்", speech
        ):
            return None
        if re.search(
            r"\b(no|not|stop|later|busy|wrong|voicemail|cancel|don t|do not)\b", value
        ) or re.search(r"இல்லை|வேண்டாம்|வேணாம்|பிறகு|தவறான", speech):
            return False
        if re.search(
            r"\b(yes|yeah|yep|sure|okay|ok|agree|go ahead|please continue|please save)\b", value
        ) or re.search(r"ஆமாம்|ஆமாங்க|ஆம்|சரி|செய்யலாம்|தொடரலாம்|முடிக்கலாம்|சேமி", speech):
            return True
        return None

    async def answer(self, session_id: str, call_sid: str, turn: int, speech: str) -> str:
        async with self.lock:
            record = self.store.phone_turn(call_sid, turn)
            if record["session_id"] != session_id:
                raise ValueError("Phone turn mismatch")
            record = self.store.accept_phone_speech(call_sid, turn, speech)
            if record["response"] is not None:
                return record["response"]
            self.runtime.sheets.wake.set()
            logger.info("You: %s", speech or "[silence]")
            try:
                xml = await self.process(record, speech)
            except (IntegrationError, ValueError) as exc:
                logger.warning("%s", exc)
                xml = self.finish(
                    session_id,
                    self.MODEL_ERROR,
                )
            self.store.save_phone_result(call_sid, turn, response=xml)
            return xml

    async def process(self, record: dict, speech: str) -> str:
        session_id, call_sid, turn, section = (
            record["session_id"],
            record["call_sid"],
            record["turn"],
            record["section"],
        )
        if not speech:
            if record["question"].startswith("I didn't hear you."):
                return self.finish(session_id, self.SILENCE)
            return self.question(
                session_id, call_sid, turn + 1, section, "I didn't hear you. " + record["question"]
            )
        permission = self.permission(speech)
        if section in {"consent", "resume_consent"}:
            if permission is None:
                previous = self.store.phone_context(call_sid, turn, section)
                if any(item["role"] == "user" for item in previous):
                    return self.finish(session_id, "Let's leave it here for now. Goodbye.")
                return self.question(
                    session_id,
                    call_sid,
                    turn + 1,
                    section,
                    "May I continue this check-in and save your answers? Please say yes or no, or press 1 for yes and 2 for no.",
                )
            if section == "consent":
                self.checkin.answer(
                    session_id,
                    AnswerInput(section=Section.CONSENT, answer=speech, consent=permission),
                )
            if not permission:
                return self.finish(
                    session_id,
                    self.DECLINE,
                    interrupt=section == "resume_consent",
                )
            return self.question(session_id, call_sid, turn + 1)
        if section == "review" and permission is True:
            self.checkin.complete(session_id, CompleteInput(confirmed=True))
            return self.finish(
                session_id,
                self.COMPLETE,
                interrupt=False,
            )
        if section == "review" and speech == "2":
            return self.finish(
                session_id,
                self.REVIEW_PAUSE,
            )
        if speech == "2" and section != "review":
            self.checkin.answer(
                session_id,
                AnswerInput(section=Section(section), answer="Skipped by request", skipped=True),
            )
            return self.question(session_id, call_sid, turn + 1)
        state = self.checkin.state(session_id)
        if record["interpretation"]:
            result = Interpretation.model_validate_json(record["interpretation"])
        else:
            context = self.store.phone_context(call_sid, turn, section)
            context.append({"role": "assistant", "content": record["question"]})
            answers = {name: dict(value) for name, value in state["answers"].items()}
            for name, field in (("spending", "expenses"), ("income", "income")):
                if name in answers:
                    answers[name]["entries"] = state[field]
            result = await self.ai.interpret(section, speech, answers, context=context)
            self.store.save_phone_result(call_sid, turn, interpretation=result.model_dump_json())
        if result.action == "stop":
            return self.finish(
                session_id,
                self.STOP,
            )
        if result.action == "clarify":
            if not result.clarification:
                raise ValueError("The model did not provide a clarification")
            previous = self.store.phone_context(call_sid, turn, section)
            if section == "review":
                if any(item["role"] == "user" for item in previous):
                    return self.finish(
                        session_id,
                        self.REVIEW_PAUSE,
                    )
                return self.question(session_id, call_sid, turn + 1, section, self.REVIEW_CONFIRM)
            if not any(item["role"] == "user" for item in previous):
                return self.question(
                    session_id, call_sid, turn + 1, section, self.CLARIFICATIONS[section]
                )
            fragments = [item["content"] for item in previous if item["role"] == "user"] + [speech]
            captured = "; ".join(dict.fromkeys(fragments))[:4500]
            self.checkin.answer(
                session_id,
                AnswerInput(
                    section=Section(section),
                    answer="Unclear after one follow-up: " + captured,
                    details_complete=section not in {"spending", "income"},
                ),
            )
            self.runtime.sheets.wake.set()
            logger.info("Unresolved details retained | %s | moving to next topic", section)
            return self.question(session_id, call_sid, turn + 1)
        target = result.section.value if result.section else section
        if result.action == "record" and target != section:
            raise ValueError("AI tried to record a different section")
        if result.action == "correct" and target not in state["answers"]:
            raise ValueError("There is no saved answer to correct")
        if target == "consent" or section == "review" and result.action != "correct":
            return self.question(
                session_id,
                call_sid,
                turn + 1,
                section,
                "Please confirm the summary with yes, or tell me which saved answer to correct.",
            )
        if not result.answer.strip():
            raise ValueError("AI did not return a usable answer")
        answer = AnswerInput(
            section=Section(target),
            answer=result.answer,
            entries=result.entries,
            details_complete=result.details_complete,
            skipped=result.skipped,
        )
        self.checkin.answer(session_id, answer)
        if self.settings.phone_voice_provider == "eleven_labs":
            for part in self.summary_parts(session_id):
                self.voice.prepare(part)
        self.runtime.sheets.wake.set()
        logger.info("Saved | %s | %s", target, result.answer)
        if result.action == "correct":
            return self.question(
                session_id,
                call_sid,
                turn + 1,
                section,
                self.summary(session_id)
                if section == "review"
                else "I've updated that answer. " + record["question"],
            )
        return self.question(session_id, call_sid, turn + 1)
