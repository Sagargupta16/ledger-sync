"""Request and response models for balance checks.

Amounts arrive as exact decimals (two places, the NUMERIC(15, 2) range of
``transactions.amount``) and leave as JSON numbers like every other endpoint.
Dates are ``YYYY-MM-DD`` IST calendar days.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

#: matched: the newest check agrees with the ledger and nothing is dated after it.
#: mismatch: the newest check disagrees by more than the tolerance.
#: changed: the newest check agreed, but rows are dated after it.
#: unchecked: no check yet. idle: no row or check within ``idle_days``.
BalanceStatus = Literal["matched", "mismatch", "changed", "unchecked", "idle"]

_MAX_BALANCE = Decimal("9999999999999.99")

#: The earliest day a check can name. A desktop date input turns a two-digit
#: year into year 0026, and no bank app shows a balance from before 2000.
EARLIEST_CHECK_DAY = date(2000, 1, 1)


class BalanceCheckUpdate(BaseModel):
    """A corrected day or amount for an existing check. The account stays fixed."""

    check_date: date = Field(
        ge=EARLIEST_CHECK_DAY, description="From 2000-01-01; no later than today (IST)."
    )
    balance: Decimal = Field(
        ge=-_MAX_BALANCE,
        le=_MAX_BALANCE,
        decimal_places=2,
        description="Signed INR: card dues and overdrafts are negative.",
    )


class BalanceCheckCreate(BalanceCheckUpdate):
    """Record what the bank showed; a second check on the same day replaces it."""

    account: str = Field(min_length=1, max_length=255)


class BalanceCheckEntry(BaseModel):
    """One stored check, as returned after a write."""

    id: int
    account: str
    check_date: str
    balance: float


class BalanceCheckResult(BaseModel):
    """A stored check against the ledger's running balance at the end of its day."""

    id: int
    check_date: str
    balance: float
    ledger_balance: float
    #: Bank minus ledger: positive means the ledger holds less than the bank.
    difference: float
    matches: bool


class AccountMonth(BaseModel):
    """A calendar month in which the account has rows."""

    month: str
    rows: int


class AccountBalanceHealth(BaseModel):
    """Freshness, checks and month coverage for one account."""

    account: str
    is_closed: bool
    status: BalanceStatus
    #: The running balance at the end of ``as_of``; rows dated later are left out.
    ledger_balance: float
    #: Every live row, including any dated after ``as_of``; so are the dates and months.
    transaction_count: int
    first_date: str | None
    last_date: str | None
    #: The later of the newest row on or before ``as_of`` and the newest check:
    #: what ``idle`` is measured from. ``None`` with neither.
    last_activity: str | None
    #: Rows dated after the newest check, up to ``as_of``; 0 when there is no check.
    rows_after_check: int
    #: Newest first.
    checks: list[BalanceCheckResult]
    #: Months with rows only, oldest first; empty months in between are gaps.
    months: list[AccountMonth]


class BalanceChecksSummary(BaseModel):
    """Every account the ledger knows, ordered by name."""

    as_of: str
    idle_days: int
    tolerance: float
    accounts: list[AccountBalanceHealth]
