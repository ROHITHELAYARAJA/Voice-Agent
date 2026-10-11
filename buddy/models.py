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
