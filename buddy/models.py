from decimal import Decimal
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Section(StrEnum):
    CONSENT = "consent"
    ACCOMPLISHMENTS = "accomplishments"
    LEARNING = "learning"
    SPENDING = "spending"
    INCOME = "income"
    WELLBEING = "wellbeing"
    TOMORROW = "tomorrow"
    NOTES = "notes"


QUESTIONS = {
    Section.CONSENT: "Is now a good time for a short daily check-in? I'll save your answers for you.",
    Section.ACCOMPLISHMENTS: "What did you get done today?",
    Section.LEARNING: "What did you learn or make progress on today?",
    Section.SPENDING: "What did you spend money on today?",
    Section.INCOME: "Did you receive any income today?",
    Section.WELLBEING: "How are you feeling today?",
    Section.TOMORROW: "What is your main priority for tomorrow?",
    Section.NOTES: "Is there anything else you want to remember from today?",
}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MoneyEntry(StrictModel):
