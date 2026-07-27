"""Tunable thresholds and calendar rules for the written-insight engine.

Split out of ``insights.py`` so the engine file stays inside the 200-line
budget, and so the two things a future tweak touches -- the numeric thresholds
and the definition of a "complete" month -- live in one place instead of being
inlined at each decision site.

The calendar helpers here encode the repo-wide partial-month split:

* **Totals may include the month in progress.** Money already spent is real.
* **Averages, trends, volatility, peaks and growth rates may not.** A month
  three days old is not a comparable observation. Measured against the real
  workbook, letting one in-progress month into a rate produced a -696.8%
  figure, and on the Income Analysis page it turned a true +18.1% growth rate
  into -95.6%.

``is_partial_month`` deliberately matches the frontend's ``getMonthProgress``
(``frontend/src/lib/dateUtils.ts``) so the same month is judged the same way on
both sides of the API: only the CURRENT month can be partial, and not on its
final calendar day, where every day of the month already exists.
"""

from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import TYPE_CHECKING

from ledger_sync.db.models import TransactionType

if TYPE_CHECKING:
    from ledger_sync.db.models import Transaction

# Heuristic thresholds used across insight generation. Named here rather
# than inlined so their meaning is discoverable and a future tweak is a
# one-line change. Values are informed guesses, not policy -- a rewrite
# to user-tunable preferences is tracked as INS-1b.
CONSISTENCY_HIGH_VOLATILITY = 40  # score < this -> "high volatility" insight
CONSISTENCY_STEADY = 80  # score > this -> "consistent pattern" insight
CATEGORY_CONCENTRATION_ALERT_PCT = 40  # top category share > this -> flag
CONVENIENCE_SPENDING_ALERT_PCT = 30  # discretionary share > this -> flag
SPENDING_TREND_UP_RATIO = 1.2  # recent_avg / overall_avg > this -> trending up
SPENDING_TREND_DOWN_RATIO = 0.8  # recent_avg / overall_avg < this -> trending down
LIFESTYLE_INFLATION_ALERT_PCT = 20  # spending up > this% -> lifestyle inflation
LIFESTYLE_DEFLATION_POSITIVE_PCT = -10  # spending down < this% -> positive signal
SPENDING_VELOCITY_UP_RATIO = 1.3  # recent/historical > this -> accelerating
SPENDING_VELOCITY_DOWN_RATIO = 0.7  # recent/historical < this -> slowing
RECENT_MONTHS_WINDOW = 3  # "recent" = last N months for trend compare
DAYS_PER_MONTH_AVG = 30.44  # 365.25 / 12, for daily->monthly projection

# A coefficient of variation needs at least two observations to mean anything:
# ``calculate_consistency_score`` returns a flat 100.0 for a single month, which
# would otherwise publish "your spending is very predictable" off one month of
# history.
MIN_MONTHS_FOR_VOLATILITY = 2

# The default display symbol, matching ``AnalyticsBase._currency_symbol`` and
# the ``UserPreferences.currency_symbol`` column default.
DEFAULT_CURRENCY_SYMBOL = "₹"

# The complete severity vocabulary an insight may carry. Kept here so a new
# generator cannot quietly invent a fifth value that no consumer can style.
INSIGHT_SEVERITIES = frozenset({"info", "neutral", "positive", "warning"})

MONTH_KEY_LENGTH = 7  # len("YYYY-MM")


def month_key(moment: date) -> str:
    """The ``YYYY-MM`` bucket a date falls in, matching ``group_by_month``."""
    return f"{moment.year:04d}-{moment.month:02d}"


def is_partial_month(key: str, today: date) -> bool:
    """Whether the ``YYYY-MM`` month *key* is still in progress on *today*.

    Past and future months are both complete for comparison purposes -- only
    the current one can be partial, and not on its last day.
    """
    if key[:MONTH_KEY_LENGTH] != month_key(today):
        return False
    return today.day < monthrange(today.year, today.month)[1]


def completed_monthly_data(
    monthly_data: dict[str, dict[str, float]],
    today: date,
) -> dict[str, dict[str, float]]:
    """Drop the in-progress month from a ``group_by_month`` result.

    May return an empty dict -- the caller must abstain from the insight rather
    than publish a number computed over nothing.
    """
    return {k: v for k, v in monthly_data.items() if not is_partial_month(k, today)}


def completed_month_expenses(transactions: list[Transaction], today: date) -> list[Transaction]:
    """Expense rows outside the month in progress.

    For the window comparisons (lifestyle inflation) that bucket by calendar
    month: a half-finished trailing month drags the late-window average down and
    reports a spending *reduction* the user has not made.
    """
    return [
        t
        for t in transactions
        if t.type == TransactionType.EXPENSE and not is_partial_month(month_key(t.date), today)
    ]
