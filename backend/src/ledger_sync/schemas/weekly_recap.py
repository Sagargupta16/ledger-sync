"""Response models for ``GET /api/weekly-recap`` (``core/weekly_recap.py``).

Money is INR at book value, rounded to paise; percentages carry one decimal.
``None`` always means "no basis to compare against", never zero.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel

FlowKind = Literal["Income", "Expense"]


class RecapWeek(BaseModel):
    """The Monday-to-Sunday IST week and the window it is compared with."""

    start: date
    end: date
    as_of: date
    #: Monday opening the baseline, or ``None`` when no full week precedes the
    #: recap week in the ledger.
    baseline_start: date | None
    #: Full weeks averaged, 0 to 4. Weeks before the first transaction are left
    #: out rather than counted as weeks with no spending.
    baseline_weeks: int
    data_from: date | None
    #: The latest transaction dated on or before ``as_of``; a row dated ahead
    #: does not count.
    data_through: date | None
    #: False when ``data_through`` is before the week's Sunday, so the week may
    #: be incomplete: an import lag, or only a quiet Sunday.
    is_complete: bool


class RecapSpending(BaseModel):
    """Spending excludes classified realised losses, like every spend total."""

    this_week: float
    weekly_average: float | None
    change: float | None
    change_pct: float | None


class CategoryMover(BaseModel):
    category: str
    this_week: float
    weekly_average: float
    change: float
    #: ``None`` when the category had no spending in the baseline weeks.
    change_pct: float | None


class NetWorthDriver(BaseModel):
    """The category whose flow moved net worth most, signed: income is positive."""

    category: str
    type: FlowKind
    amount: float


class RecapNetWorth(BaseModel):
    """Book value: income minus every expense row, as ``/daily-net-worth`` counts it."""

    start: float
    end: float
    change: float
    income: float
    expenses: float
    driver: NetWorthDriver | None


class BillDue(BaseModel):
    id: int
    name: str
    category: str
    frequency: str
    #: The first due date in the window; a past one rolls forward by cadence.
    due_date: date
    days_until: int
    #: The effective amount: the user's own when set, else the detected one.
    amount: float
    #: More than 1 only for daily, weekly and fortnightly commitments.
    occurrences: int
    total: float
    is_confirmed: bool


class RecapBills(BaseModel):
    """Recurring expense commitments only; card statement dues are not included."""

    #: Today; the window runs to seven days after it, like the notification bell.
    window_start: date
    window_end: date
    total: float
    items: list[BillDue]


class RecapAnomaly(BaseModel):
    id: int
    type: str
    severity: str
    #: For the card only. It can quote an account, a note and an amount, so
    #: the AI explanation is built from the structured fields instead.
    description: str
    #: The flagged transaction's date; ``None`` for a month-level finding.
    occurred_on: date | None
    period: str | None
    amount: float | None


class RecapPayday(BaseModel):
    """The next payday from the day of month set in Settings."""

    day_of_month: int
    next_date: date
    days_until: int


class WeeklyRecapResponse(BaseModel):
    week: RecapWeek
    spending: RecapSpending
    movers: list[CategoryMover]
    net_worth: RecapNetWorth
    bills: RecapBills
    anomalies: list[RecapAnomaly]
    anomaly_count: int
    payday: RecapPayday
