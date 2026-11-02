"""Request bodies for the recurring-transaction endpoints."""

from __future__ import annotations

from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field, model_validator

from ledger_sync.schemas.transactions import PositiveAmount


def _no_nul(value: str) -> str:
    if "\x00" in value:
        msg = "Text cannot contain a NUL character."
        raise ValueError(msg)
    return value


# The pattern_name and category columns are 255 characters.
ColumnText = Annotated[str, Field(max_length=255), AfterValidator(_no_nul)]


class RecurringTransactionUpdate(BaseModel):
    """Partial update for a recurring transaction.

    On a detected row, ``expected_amount`` is kept beside the detected amount,
    which every analytics refresh re-derives from history, so the user's amount
    survives refresh. ``reset_amount`` clears it and the detected amount
    applies again. A request sends one or the other. Refresh deletes
    unconfirmed rows, so an amount cannot come with ``is_confirmed=false``.
    """

    pattern_name: ColumnText | None = None
    frequency: str | None = None
    expected_amount: PositiveAmount | None = None
    reset_amount: bool = False
    is_confirmed: bool | None = None
    is_active: bool | None = None
    pattern_kind: str | None = None

    @model_validator(mode="after")
    def _consistent_amount_change(self) -> RecurringTransactionUpdate:
        if self.expected_amount is None:
            return self
        if self.reset_amount:
            msg = "Send expected_amount or reset_amount, not both."
            raise ValueError(msg)
        if self.is_confirmed is False:
            msg = "An amount you set needs a confirmed item; drop is_confirmed=false."
            raise ValueError(msg)
        return self


class RecurringTransactionCreate(BaseModel):
    """Create a user-defined recurring transaction."""

    name: ColumnText
    type: str  # "Income" or "Expense"
    frequency: str
    amount: PositiveAmount
    category: ColumnText | None = None
    expected_day: int | None = Field(default=None, ge=1, le=31)
