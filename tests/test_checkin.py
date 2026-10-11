import pytest

from buddy.agent import build_agent_settings
from buddy.checkin import CheckinService
from buddy.models import AnswerInput, CompleteInput, Section
from buddy.storage import Store


@pytest.fixture
def checkin(settings):
    store = Store(settings.data_dir / "test.sqlite3")
    session = store.create("2026-10-11")
    return CheckinService(store), session["id"]


def finish_questions(service, session_id):
    for section in Section:
        payload = {
            "section": section,
            "answer": "Yes" if section == Section.CONSENT else "Nothing to add",
        }
        if section == Section.CONSENT:
            payload["consent"] = True
        service.answer(session_id, AnswerInput(**payload))


def test_questions_cannot_be_skipped_without_answer(checkin):
    service, sid = checkin
    with pytest.raises(ValueError, match="current question"):
        service.answer(sid, AnswerInput(section="spending", answer="Lunch"))
    with pytest.raises(ValueError, match="confirmation"):
        service.complete(sid, CompleteInput(confirmed=True))
    assert service.state(sid)["answers"] == {}


def test_refusal_does_not_complete_and_blocks_collection(checkin):
    service, sid = checkin
    result = service.answer(sid, AnswerInput(section="consent", answer="Not now", consent=False))
    assert result["status"] == "declined"
    assert result["next_section"] is None
    with pytest.raises(ValueError, match="closed"):
        service.answer(sid, AnswerInput(section="accomplishments", answer="Work"))


def test_exact_money_corrections_skips_and_confirmation(checkin):
    service, sid = checkin
    finish_questions(service, sid)
    service.answer(
        sid,
        AnswerInput(
            section="spending",
            answer="Two snacks and a USD payment",
            entries=[
                {"description": "Snack", "amount": "0.10", "currency": "INR"},
                {"description": "Tea", "amount": "0.20", "currency": "INR"},
                {"description": "Subscription", "amount": "3.20", "currency": "USD"},
            ],
        ),
    )
    assert service.state(sid)["spending_totals"] == {"INR": "0.30", "USD": "3.20"}
    service.answer(
        sid,
        AnswerInput(
            section="spending",
            answer="Only tea, corrected",
            entries=[{"description": "Tea", "amount": "0.20", "currency": "INR"}],
        ),
    )
    assert len(service.state(sid)["expenses"]) == 1
    service.answer(sid, AnswerInput(section="wellbeing", answer="Skipped by user", skipped=True))
    with pytest.raises(ValueError, match="confirmation"):
        service.complete(sid, CompleteInput(confirmed=False))
    assert service.complete(sid, CompleteInput(confirmed=True))["status"] == "completed"


def test_tool_replay_and_invalid_arguments(checkin):
    service, sid = checkin
    args = '{"section":"consent","answer":"Yes","consent":true}'
    first = service.execute(sid, "function-1", "record_answer", args)
    version = service.store.get(sid)["version"]
