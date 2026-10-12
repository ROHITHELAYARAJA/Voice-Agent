import asyncio
import logging
import re

from twilio.twiml.voice_response import VoiceResponse

from buddy.deepgram_ai import DeepgramAI
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
        self.ai = (DeepgramAI if self.settings.gather_ai_provider == "deepgram" else LocalAI)(
            self.settings, runtime.http
        )
        self.voice = VoiceAudio(self.settings, self.store)
        self.lock = asyncio.Lock()

    def say(self, response, text: str, session_id: str) -> None:
        if self.settings.phone_voice_provider == "eleven_labs":
            response.play(self.voice.token_url(session_id, text))
        else:
            response.say(
                text, voice=self.settings.phone_voice, language=self.settings.phone_language
            )

    def finish(self, session_id: str, text: str, interrupt: bool = True) -> str:
        response = VoiceResponse()
        self.say(response, text, session_id)
        response.hangup()
        if interrupt:
            self.checkin.end(session_id, EndInput(reason="user_request"))
        return str(response)

    def summary_parts(self, session_id: str) -> list[str]:
        state = self.checkin.state(session_id)
        parts = [self.REVIEW_START]
        for section in (
            "accomplishments",
            "learning",
            "spending",
            "income",
            "wellbeing",
            "tomorrow",
            "notes",
        ):
            answer = state["answers"].get(section)
            if not answer or answer.get("skipped"):
                continue
            if section in {"spending", "income"}:
                entries = state["expenses" if section == "spending" else "income"]
                if entries:
                    text = f"{section.capitalize()}: {', '.join(f'{e['amount']} {self.settings.currency} for {e['description']}' for e in entries)}."
                else:
                    text = f"{section.capitalize()}: none."
            else:
                text = f"{section.capitalize()}: {answer['answer']}."
            parts.append(text)
        parts.append(self.REVIEW_CONFIRM)
        return parts

    def summary(self, session_id: str) -> str:
        return " ".join(self.summary_parts(session_id))
