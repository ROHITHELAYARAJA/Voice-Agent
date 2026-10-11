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
    description: str = Field(min_length=1, max_length=300)
    amount: Annotated[Decimal, Field(gt=0, le=Decimal("1000000000"), decimal_places=2)]
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    category: str = Field(default="Other", min_length=1, max_length=80)

    @field_validator("description", "category")
    @classmethod
    def strip_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Text cannot be blank")
        return value.strip()


class AnswerInput(StrictModel):
    section: Section
    answer: str = Field(min_length=1, max_length=5000)
    skipped: bool = False
    details_complete: bool = Field(
        default=True,
        description="For spending/income: false if any amount is missing or estimated; put uncertain details in answer, outside entries.",
    )
    consent: bool | None = None
    entries: list[MoneyEntry] = Field(default_factory=list, max_length=50)

    @field_validator("answer")
    @classmethod
    def strip_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Answer cannot be blank")
        return value.strip()


class CompleteInput(StrictModel):
    confirmed: bool


class EndInput(StrictModel):
    reason: str = Field(default="User requested to stop", max_length=300)


def totals(entries: list[dict]) -> dict[str, str]:
    amounts: dict[str, Decimal] = {}
    for entry in entries:
        currency = entry["currency"]
        amounts[currency] = amounts.get(currency, Decimal("0")) + Decimal(entry["amount"])
    return {currency: f"{amount:.2f}" for currency, amount in sorted(amounts.items())}
