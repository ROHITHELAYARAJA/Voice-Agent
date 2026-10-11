import json

from pydantic import ValidationError

from buddy.models import QUESTIONS, AnswerInput, CompleteInput, EndInput, Section, totals
from buddy.storage import Store


class CheckinService:
    def __init__(self, store: Store, sheet_target: str | None = None):
        self.store = store
        self.sheet_target = sheet_target

    def state(self, session_id: str) -> dict:
        session = self.store.get(session_id)
        answers = session["answers"]
        next_section = next((section for section in Section if section.value not in answers), None)
        terminal = session["status"] in {"completed", "declined"}
        synced_version = (
            self.store.synced_version(session_id, self.sheet_target)
            if self.sheet_target
            else session["synced_version"]
        )
        return {
            "session_id": session_id,
            "date": session["checkin_date"],
            "status": session["status"],
            "answers": answers,
            "expenses": session["expenses"],
            "income": session["income"],
