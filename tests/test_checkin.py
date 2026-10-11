import pytest

from buddy.agent import build_agent_settings
from buddy.checkin import CheckinService
from buddy.models import AnswerInput, CompleteInput, Section
from buddy.sheets import checkin_row
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
    assert service.execute(sid, "function-1", "record_answer", args) == first
    assert service.store.get(sid)["version"] == version
    assert service.execute(sid, "function-2", "record_answer", "not json")["ok"] is False
    assert (
        service.execute(
            sid,
            "function-3",
            "record_answer",
            {
                "section": "spending",
                "answer": "test",
                "entries": [{"amount": "-3", "currency": "INR", "description": "tea"}],
            },
        )["ok"]
        is False
    )


def test_answers_survive_reopening_the_database(checkin):
    service, sid = checkin
    service.answer(sid, AnswerInput(section="consent", answer="Yes", consent=True))
    reopened = CheckinService(Store(service.store.path))
    assert reopened.state(sid)["next_section"] == "accomplishments"


def test_agent_uses_requested_model_and_authenticated_jessica(settings, checkin):
    service, sid = checkin
    value = build_agent_settings(settings, service.state(sid))
    assert value["agent"]["think"]["provider"]["model"] == "gemini-3.8-flash"
    assert value["agent"]["think"]["provider"]["type"] == "google"
    assert "endpoint" not in value["agent"]["think"]
    speak = value["agent"]["speak"]
    assert "cgSgspJ2msm6clMCkdW9" in speak["endpoint"]["url"]
    assert speak["endpoint"]["headers"]["xi-api-key"] == "test-elevenlabs"
    assert "voice_id" not in speak["provider"]
    assert all(function["defer_until_eot"] for function in value["agent"]["think"]["functions"])


def test_partial_money_stays_explicit_until_corrected(checkin):
    service, sid = checkin
    finish_questions(service, sid)
    result = service.execute(
        sid,
        "partial",
        "record_answer",
        {
            "section": "spending",
            "answer": "Tea 20 rupees; lunch amount not remembered",
            "details_complete": False,
            "entries": [{"description": "Tea", "amount": "20.00", "currency": "INR"}],
        },
    )
    assert result["ok"]
    assert result["spending_totals"] == {"INR": "20.00"}
    assert result["incomplete_money_sections"] == ["spending"]
    row = checkin_row(service.store.get(sid), "Asia/Kolkata")
    assert "Details incomplete" in row[5]
    assert "not remembered" in row[5]
    corrected = service.execute(
        sid,
        "corrected",
        "record_answer",
        {
            "section": "spending",
            "answer": "Tea 20 rupees and lunch 80 rupees",
            "details_complete": True,
            "entries": [
                {"description": "Tea", "amount": "20.00", "currency": "INR"},
                {"description": "Lunch", "amount": "80.00", "currency": "INR"},
            ],
        },
    )
    assert corrected["spending_totals"] == {"INR": "100.00"}
    assert corrected["incomplete_money_sections"] == []
    assert "Details incomplete" not in checkin_row(service.store.get(sid), "Asia/Kolkata")[5]


@pytest.mark.parametrize("section", ["spending", "income"])
def test_unknown_money_is_distinct_from_none_and_skip(checkin, section):
    service, sid = checkin
    finish_questions(service, sid)
    unknown = service.answer(
        sid,
        AnswerInput(
            section=section,
            answer="Amount not remembered",
            details_complete=False,
        ),
    )
    assert unknown["incomplete_money_sections"] == [section]
    assert unknown[f"{section}_totals"] == {}
    completed = service.complete(sid, CompleteInput(confirmed=True))
    assert completed["incomplete_money_sections"] == [section]
    assert completed["answers"][section]["skipped"] is False


@pytest.mark.parametrize("amount", ["0", "-5", "1.234"])
def test_invalid_money_never_changes_saved_state(checkin, amount):
    service, sid = checkin
    finish_questions(service, sid)
    before = service.store.get(sid)
    result = service.execute(
        sid,
        "invalid-money",
        "record_answer",
        {
            "section": "spending",
            "answer": "Uncertain tea price",
            "entries": [{"description": "Tea", "amount": amount, "currency": "INR"}],
        },
    )
    assert result["ok"] is False
    assert service.store.get(sid)["version"] == before["version"]
    assert service.store.get(sid)["expenses"] == before["expenses"]


def test_resume_requires_permission_without_disclosing_saved_details(settings, checkin):
    service, sid = checkin
    service.answer(sid, AnswerInput(section="consent", answer="Yes", consent=True))
    service.answer(sid, AnswerInput(section="accomplishments", answer="Finished a private project"))
    state = service.state(sid)
    agent = build_agent_settings(settings, state)["agent"]
    assert "AI check-in companion" in agent["greeting"]
    assert "Is now a good time" in agent["greeting"]
    assert "private project" not in agent["greeting"]
    assert state["next_section"] == "learning"
