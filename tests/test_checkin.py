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
