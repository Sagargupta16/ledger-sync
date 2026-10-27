"""Response models for credit-card statement cycles (``GET /api/card-cycles``).

Amounts are INR and never negative except ``spend``, where refunds can exceed
purchases, and the paying account's ``balance`` and ``cash_after_dues``.
Dates are IST calendar days.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel

# Only the latest statement can be ``due``, ``partial`` or ``overdue``. An older
# one is ``paid`` once later payments cover it and ``rolled_over`` until then:
# what it still owes is inside the next statement's bill.
CycleStatus = Literal["open", "nothing_due", "paid", "partial", "due", "overdue", "rolled_over"]
SkipReason = Literal["closed", "no_settings"]


class CardCycle(BaseModel):
    """One statement period of a card.

    ``billed`` is what the card owed when the period closed, including any
    unpaid earlier balance; ``spend`` is the period's own purchases less refunds.
    ``paid`` is what payments into the card since the close put toward it,
    oldest bill first, and never more than ``billed``. The open period has no
    bill and no payments yet.
    """

    period_start: date
    statement_date: date
    due_date: date
    status: CycleStatus
    spend: float
    billed: float
    paid: float
    remaining: float
    paid_on: date | None
    paid_from_paying_account: bool


class CardCycleCard(BaseModel):
    """A card's latest closed statement, its open period, and recent history.

    The flat fields repeat ``cycles[1]`` (the latest statement) and ``cycles[0]``
    (the open period) so a summary needs no list walking. ``unbilled_amount`` is
    the open period's spend, floored at zero. ``carried_in`` is the part of the
    latest bill that earlier statements still owed once this period's payments
    were counted: above zero when the card was not paid off, or when a payment
    or an opening balance is missing from the ledger.
    """

    account_id: int
    name: str
    statement_day: int
    payment_day: int
    paying_account_id: int | None
    paying_account: str | None
    last_statement_date: date
    next_statement_date: date
    due_date: date
    days_to_due: int
    billed_amount: float
    paid_amount: float
    due_amount: float
    carried_in: float
    status: CycleStatus
    paid_on: date | None
    paid_from_paying_account: bool
    unbilled_amount: float
    next_due_date: date
    days_to_next_due: int
    cycles: list[CardCycle]


class PayingAccountCash(BaseModel):
    """Cash in an account that pays cards, before and after their unpaid statements."""

    account_id: int
    name: str
    balance: float
    upcoming_dues: float
    unbilled: float
    cash_after_dues: float
    cards: list[str]


class SkippedCard(BaseModel):
    """A credit card with no cycle, and why."""

    account_id: int
    name: str
    reason: SkipReason


class CardCyclesResponse(BaseModel):
    as_of: date
    cards: list[CardCycleCard]
    paying_accounts: list[PayingAccountCash]
    skipped: list[SkippedCard]
