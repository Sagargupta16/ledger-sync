"""Validated budget creation and partial updates."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

#: ``budgets.monthly_limit`` is Numeric(15, 2), so 13 digits before the point.
#: Checked as ``le`` on the float the client sent, so the half-up rounding to
#: paise that follows cannot carry an accepted value past the column.
MAX_MONTHLY_LIMIT = 9_999_999_999_999.99


class CreateBudgetRequest(BaseModel):
    """One monthly limit. A blank subcategory budgets the whole category."""

    # "Food " and "Food" are one scope, and a blank category tracks nothing.
    model_config = ConfigDict(str_strip_whitespace=True)

    category: str = Field(min_length=1, max_length=255)
    monthly_limit: float = Field(ge=0.01, le=MAX_MONTHLY_LIMIT)
    subcategory: str | None = Field(default=None, max_length=255)
    alert_threshold: float = Field(default=80.0, ge=0, le=100)


class UpdateBudgetRequest(BaseModel):
    """Omitted (or null) fields keep their stored value."""

    monthly_limit: float | None = Field(default=None, ge=0.01, le=MAX_MONTHLY_LIMIT)
    alert_threshold: float | None = Field(default=None, ge=0, le=100)
    is_active: bool | None = None
