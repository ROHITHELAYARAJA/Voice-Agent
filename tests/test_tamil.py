from decimal import Decimal
from unittest.mock import AsyncMock

from buddy.local_ai import Interpretation, LocalAI
from buddy.phone import PhoneConversation
from buddy.runtime import BuddyRuntime
from buddy.safety import money_evidence, requests_stop, uncertain_money


def test_tamil_confirmation_corrections_and_stop():
    assert PhoneConversation.permission("ஆமாங்க, செய்யலாம்") is True
    assert PhoneConversation.permission("சரி, ஆனால் செலவை திருத்த வேண்டும்") is None
    assert PhoneConversation.permission("இல்லை, வேண்டாம்") is False
    assert requests_stop("அழைப்பை முடி")
    assert requests_stop("இங்கே நிறுத்துங்கள்")
    assert not requests_stop("செலவு இல்லை")
    assert not requests_stop("நான் செலவை நிறுத்துவேன்")


def test_tamil_amounts_and_uncertainty():
    assert Decimal("120") in money_evidence("மதிய உணவுக்கு நூற்று இருபது ரூபாய்")
    assert Decimal("80") in money_evidence("பேருந்துக்கு எண்பது ரூபாய்")
    assert Decimal("1520") in money_evidence("ஆயிரத்து ஐந்நூறு இருபது ரூபாய்")
    assert uncertain_money("சுமார் 150 ரூபாய் செலவு")
    assert uncertain_money("பணத்திருப்பம் 500 ரூபாய் வந்தது")


async def test_tamil_no_income_and_estimates_are_not_fabricated(settings):
    runtime = BuddyRuntime(settings)
    ai = LocalAI(settings, runtime.http)
    ai.generate = AsyncMock(
        return_value=Interpretation(
            action="record", section="income", answer="வருமானம் இல்லை", entries=[]
        )
    )
    try:
        assert (await ai.interpret("income", "வருமானம் இல்லை", {})).action == "record"
        ai.generate = AsyncMock(
            return_value=Interpretation(
                action="record",
                section="spending",
                answer="150 ரூபாய்",
                entries=[{"description": "உணவு", "amount": 150, "currency": "INR"}],
            )
        )
        assert (await ai.interpret("spending", "சுமார் 150 ரூபாய்", {})).action == "clarify"
    finally:
        await runtime.close()


def test_tamil_gather_is_nested_and_configures_recognition(settings):
    settings.call_mode = "gather"
    settings.conversation_language = "ta"
    settings.phone_language = "ta-IN"
    settings.phone_speech_model = "googlev2_chirp_3"
    runtime = BuddyRuntime(settings)
    session = runtime.new_session()
    runtime.store.update(session["id"], call_sid="CA123", call_status="in-progress")
    xml = runtime.phone.begin(session["id"], "CA123")
    assert 'language="ta-IN"' in xml and 'speechModel="googlev2_chirp_3"' in xml
    assert "வணக்கம்" in xml
    assert "<Gather" in xml
    import asyncio

    asyncio.run(runtime.close())
