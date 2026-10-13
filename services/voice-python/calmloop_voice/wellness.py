import re
from datetime import datetime
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, model_validator

TOPICS = (
    "mood",
    "water",
    "sleep",
    "health",
    "energy",
    "stress",
    "nutrition",
    "activity",
    "habits",
    "goals",
    "achievement",
    "gratitude",
    "journal",
    "memory",
    "motivation",
    "encouragement",
    "self_care",
    "health_information",
    "medication_reminder",
    "reminder",
    "patterns",
    "challenge",
    "social",
    "mindfulness",
    "screen_time",
    "follow_up",
    "preferences",
    "support",
)
METRICS = {
    "mood": ("score", 1, 10, r"mood|feeling|மனநிலை|உணர்வு|मूड|humeur|ánimo|stimmung"),
    "water": ("L", 0, 20, r"water|lit(er|re)|தண்ணீர்|நீர்|லிட்டர்|पानी|agua|eau|wasser"),
    "sleep": ("h", 0, 24, r"sleep|slept|தூக்க|தூங்கி|नींद|सोया|dorm|sommeil|schlaf"),
    "energy": ("score", 1, 10, r"energy|ஆற்றல்|சக்தி|ऊर्जा|energ|énergie"),
    "screen_time": ("h", 0, 24, r"screen|phone|திரை|போன்|स्क्रीन|pantalla|écran|bildschirm"),
}


class Observation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    topic: str = Field(pattern="^(" + "|".join(TOPICS) + ")$")
    value: float | str
    unit: str | None = Field(default=None, pattern="^(L|h|score)$")
    quote: str = Field(min_length=1, max_length=1500)
    memory_permission: str | None = Field(default=None, min_length=1, max_length=500)
    due_at: str | None = Field(default=None, max_length=60)

    @model_validator(mode="after")
    def valid_value(self):
        rule = METRICS.get(self.topic)
        if rule:
            unit, low, high, _ = rule
            if (
                not isinstance(self.value, (int, float))
                or self.unit != unit
                or not low <= self.value <= high
            ):
                raise ValueError("Explicit numeric value and correct unit required")
            if unit == "score" and self.value != int(self.value):
                raise ValueError("Score must be an integer")
        elif not isinstance(self.value, str) or not self.value.strip() or self.unit:
            raise ValueError("User's own words required")
        if isinstance(self.value, str) and len(self.value) > 1000:
            raise ValueError("Observation too long")
        if self.topic == "memory" and not self.memory_permission:
            raise ValueError("Separate memory permission required")
        if self.topic != "memory" and self.memory_permission:
            raise ValueError("Memory permission only applies to memory")
        if self.due_at:
            if self.topic not in {"reminder", "medication_reminder"}:
                raise ValueError("Only reminders may have dates")
            date = datetime.fromisoformat(self.due_at.replace("Z", "+00:00"))
            if not date.tzinfo:
                raise ValueError("Reminder timezone required")
        return self


def validate_observations(observations, turns):
    metrics = set()
    for item in observations:
        if not any(item.quote in turn for turn in turns):
            raise ValueError("Unsupported wellness quote")
        rule = METRICS.get(item.topic)
        if rule:
            if item.topic in metrics:
                raise ValueError("Keep only the corrected metric value")
            metrics.add(item.topic)
            if any(
                topic != item.topic and re.search(other[3], item.quote, re.I)
                for topic, other in METRICS.items()
            ) or re.search(r"\b(no|not|didn't|wasn't|never)\b|இல்லை|இல்ல|नहीं", item.quote, re.I):
                raise ValueError("Clarify one affirmative metric at a time")
            if re.search(r"\b(or|maybe|not sure)\b|அல்லது|தெரியவில்லை", item.quote, re.I):
                raise ValueError("Uncertain value needs clarification")
            unit, _, _, terms = rule
            numbers = [
                float(n.replace(",", ".")) for n in re.findall(r"\d+(?:[.,]\d+)?", item.quote)
            ]
            if not re.search(terms, item.quote, re.I) or item.value not in numbers:
                raise ValueError("Clarify the metric in the user's own words")
            if unit == "h" and not re.search(
                r"hours?|hrs?|மணி|घंट|heure|hora|stund", item.quote, re.I
            ):
                raise ValueError("Explicit hours required")
            if unit == "L" and not re.search(
                r"lit(er|re)|லிட்டர்|लीटर|litro|liter", item.quote, re.I
            ):
                raise ValueError("Explicit liters required")
        elif item.value.lower() not in item.quote.lower():
            raise ValueError("Text must come from the user's words")
        if item.topic == "memory":
            allowed = (
                item.memory_permission in turns
                and re.search(
                    r"^(yes,? (please )?remember (this|that|it)|remember this|இதை நினைவில் வை|ஆம்.*நினைவில்)",
                    item.memory_permission,
                    re.I,
                )
                and not re.search(
                    r"\b(not|don't|no|except|but)\b|வேண்டாம்|ஆனால்", item.memory_permission, re.I
                )
            )
            if not allowed:
                raise ValueError("Explicit separate long-term memory permission required")
        if item.due_at and item.due_at not in item.quote:
            raise ValueError("Confirm the full reminder timestamp")


def topic_plan(context, now=None):
    day = (
        (now or datetime.now(ZoneInfo(context.get("profile", {}).get("timezone", "UTC"))))
        .date()
        .toordinal()
    )
    rotating = [
        "energy",
        "nutrition",
        "activity",
        "habits",
        "goals",
        "achievement",
        "gratitude",
        "social",
        "mindfulness",
        "screen_time",
        "stress",
        "health",
        "motivation",
        "self_care",
        "challenge",
        "follow_up",
    ]
    start = (day * 5) % len(rotating)
    return ["mood", "water", "sleep"] + [rotating[(start + i) % len(rotating)] for i in range(5)]
