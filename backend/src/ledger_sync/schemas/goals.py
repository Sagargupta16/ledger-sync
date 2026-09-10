"""Validated goal creation and partial updates."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, model_validator


def _calendar_date(value: object) -> object:
    """Keep the chosen calendar date when an older client sends an ISO datetime."""
    if isinstance(value, str):
        return datetime.fromisoformat(value).date()
    if isinstance(value, datetime):
        return value.date()
    return value


GoalDate = Annotated[date, BeforeValidator(_calendar_date)]
GoalAmount = Annotated[Decimal, Field(ge=0, max_digits=15, decimal_places=2)]
GoalTarget = Annotated[Decimal, Field(gt=0, max_digits=15, decimal_places=2)]
GoalName = Annotated[str, Field(min_length=1, max_length=255)]
GoalType = Annotated[str, Field(min_length=1, max_length=50)]
GoalNotes = Annotated[str, Field(max_length=10_000)]


class CreateGoalRequest(BaseModel):
    """A goal's target and optional deadline."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    name: GoalName
    target_amount: GoalTarget
    goal_type: GoalType = "savings"
    notes: GoalNotes | None = None
    target_date: GoalDate | None = None


class UpdateGoalRequest(BaseModel):
    """Only supplied fields change; null clears a deadline or notes."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    name: GoalName | None = None
    goal_type: GoalType | None = None
    target_amount: GoalTarget | None = None
    current_amount: GoalAmount | None = None
    target_date: GoalDate | None = None
    notes: GoalNotes | None = None

    @model_validator(mode="after")
    def validate_changes(self) -> UpdateGoalRequest:
        if not self.model_fields_set:
            msg = "Supply at least one goal field to update."
            raise ValueError(msg)
        for field in ("name", "goal_type", "target_amount", "current_amount"):
            if field in self.model_fields_set and getattr(self, field) is None:
                msg = f"{field} cannot be null."
                raise ValueError(msg)
        return self
