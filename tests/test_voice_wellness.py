import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "services" / "voice-python"))
from calmloop_voice.conversation import Conversation
from calmloop_voice.wellness import Observation, topic_plan, validate_observations


def test_wellness_needs_spoken_review_and_explicit_save():
    state = Conversation()
    state.remember("yes")
    state.confirm_permission("yes")
    state.remember("I slept 7 hours.")
    state.prepare(
        {
            "statements": [{"kind": "reflection", "quote": "I slept 7 hours."}],
            "wellness": [{"topic": "sleep", "value": 7, "unit": "h", "quote": "I slept 7 hours."}],
        }
    )
    state.remember("yes")
    with pytest.raises(ValueError):
        state.reflection("yes")
    state.acknowledge(state.playback_mark())
    assert state.reflection("yes")["wellness"][0]["value"] == 7


@pytest.mark.parametrize(
    "quote,value",
    [
        ("I slept 7 minutes.", 7),
        ("I slept seven hours.", 7),
        ("I slept 7 or 8 hours.", 7),
        ("My energy is 7.", 7),
        ("I drank 7 liters of water and slept 2 hours.", 7),
        ("I didn't sleep 7 hours.", 7),
    ],
)
def test_wrong_units_uncertain_or_unrelated_numbers_remain_unknown(quote, value):
    item = Observation(topic="sleep", value=value, unit="h", quote=quote)
    with pytest.raises(ValueError):
        validate_observations([item], [quote])


def test_long_term_memory_is_not_summary_consent():
    item = Observation(
        topic="memory", value="quiet walks", quote="I like quiet walks.", memory_permission="yes"
    )
    with pytest.raises(ValueError):
        validate_observations([item], [item.quote, "yes"])
    item.memory_permission = "Yes, remember this"
    validate_observations([item], [item.quote, item.memory_permission])


def test_topic_rotation_is_bounded_and_changes_each_day():
    context = {"profile": {"timezone": "Asia/Kolkata"}}
    first = topic_plan(context, datetime(2026, 10, 13, tzinfo=timezone.utc))
    second = topic_plan(context, datetime(2026, 10, 14, tzinfo=timezone.utc))
    assert len(first) == 8
    assert len(set(first)) == 8
    assert first[:3] == ["mood", "water", "sleep"]
    assert first[3:] != second[3:]
