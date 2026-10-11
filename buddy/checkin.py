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
            "spending_totals": totals(session["expenses"]),
            "income_totals": totals(session["income"]),
            "next_section": None if terminal else next_section.value if next_section else "review",
            "next_question": None
            if terminal
            else QUESTIONS[next_section]
            if next_section
            else "Does this summary look correct, and may I finish saving your check-in?",
            "saved_locally": True,
            "sheets_status": "synced" if session["version"] == synced_version else "pending",
        }

    def answer(self, session_id: str, answer: AnswerInput) -> dict:
        session = self.store.get(session_id)
        state = self.state(session_id)
        if session["status"] in {"completed", "declined"}:
            raise ValueError("This check-in is closed. Start a new check-in.")
        if (
            answer.section.value != state["next_section"]
            and answer.section.value not in session["answers"]
        ):
            raise ValueError(f"Ask the current question first: {state['next_section']}")
        if answer.section == Section.CONSENT:
            if answer.consent is None or answer.skipped:
                raise ValueError("Explicit permission or refusal is required")
        elif answer.consent is not None:
            raise ValueError("Consent belongs only to the permission question")
        if answer.entries and (
            answer.section not in {Section.SPENDING, Section.INCOME} or answer.skipped
        ):
            raise ValueError("Money entries belong only to answered spending or income questions")
        session["answers"][answer.section.value] = {
            "answer": answer.answer,
            "skipped": answer.skipped,
        }
        changes = {"answers": session["answers"], "status": "in_progress"}
        if answer.section == Section.CONSENT:
            session["answers"]["consent"]["accepted"] = answer.consent
            if not answer.consent:
                changes["status"] = "declined"
        if answer.section == Section.SPENDING:
            changes["expenses"] = [item.model_dump(mode="json") for item in answer.entries]
        if answer.section == Section.INCOME:
            changes["income"] = [item.model_dump(mode="json") for item in answer.entries]
        if (
            all(section.value in session["answers"] for section in Section)
            and changes["status"] != "declined"
        ):
            changes["status"] = "review"
        self.store.update(session_id, **changes)
        return self.state(session_id)

    def complete(self, session_id: str, payload: CompleteInput) -> dict:
        state = self.state(session_id)
        if state["status"] == "completed":
            return state
        if state["next_section"] != "review" or not payload.confirmed:
            raise ValueError(
                "Complete all questions, read back the summary, and get explicit confirmation first"
            )
