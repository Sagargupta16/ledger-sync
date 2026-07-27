"""The two amount-shape written-insight generators.

Extracted from ``insights.py`` to keep every file inside the size budget; the
two time-based generators live in ``insight_generators_time``. Each generator is
a pure function of ``(transactions, sym, today)``:

* ``sym`` is the user's display currency symbol, threaded in from the engine so
  no f-string here hardcodes one. Nine call sites used to inline the rupee sign,
  which mislabelled every figure for a user whose display currency is not INR.
* ``today`` is the reference date for the completed-month split (see
  ``insight_rules``). Passed rather than read from the clock so the behaviour on
  the 3rd of a month is testable.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from ledger_sync.core import calculator
from ledger_sync.core.insight_builder import Insight, build_insight, expenses_of
from ledger_sync.core.insight_rules import (
    CATEGORY_CONCENTRATION_ALERT_PCT,
    CONSISTENCY_HIGH_VOLATILITY,
    CONSISTENCY_STEADY,
    CONVENIENCE_SPENDING_ALERT_PCT,
    DAYS_PER_MONTH_AVG,
    MIN_MONTHS_FOR_VOLATILITY,
    completed_monthly_data,
)

if TYPE_CHECKING:
    from datetime import date

    from ledger_sync.db.models import Transaction


def spending_insights(transactions: list[Transaction], sym: str, today: date) -> list[Insight]:
    """Volatility of monthly spending, plus the average daily burn."""
    insights: list[Insight] = []
    expenses = expenses_of(transactions)
    if not expenses:
        return insights

    # Volatility is an average-of-deviations figure, so it runs on COMPLETED
    # months only: a month three days old reads as a huge dip and can flip the
    # output to a false "High Spending Volatility".
    complete = completed_monthly_data(calculator.group_by_month(expenses), today)
    monthly_expenses = [data["expenses"] for data in complete.values()]
    # ``calculate_consistency_score`` returns a flat 100.0 when it cannot
    # compute one (fewer than two observations, or a zero mean). Publishing that
    # sentinel as a score would claim "very predictable / good budget control"
    # off a single month of history, so abstain instead of reading it as data.
    if len(monthly_expenses) >= MIN_MONTHS_FOR_VOLATILITY and sum(monthly_expenses) > 0:
        consistency = calculator.calculate_consistency_score(monthly_expenses)
        if consistency < CONSISTENCY_HIGH_VOLATILITY:
            insights.append(
                build_insight(
                    "High Spending Volatility",
                    f"Your monthly spending varies significantly. "
                    f"Consistency score: {consistency:.0f}/100. "
                    f"Consider reviewing irregular large expenses.",
                    "info",
                )
            )
        elif consistency > CONSISTENCY_STEADY:
            insights.append(
                build_insight(
                    "Consistent Spending Pattern",
                    f"Your spending is very predictable. "
                    f"Consistency score: {consistency:.0f}/100. "
                    f"This indicates good budget control.",
                    "positive",
                )
            )

    # Divides the period total by the DAYS ELAPSED in it, so the month in
    # progress shortens both sides equally and is safe to include here.
    daily_rate = calculator.calculate_daily_spending_rate(expenses)
    monthly_rate = daily_rate * DAYS_PER_MONTH_AVG
    insights.append(
        build_insight(
            "Average Daily Spending",
            f"You spend {sym}{daily_rate:,.0f} per day on average, "
            f"totaling approximately {sym}{monthly_rate:,.0f} monthly.",
            "neutral",
        )
    )
    return insights


def category_insights(transactions: list[Transaction], sym: str, today: date) -> list[Insight]:
    """Concentration in the top category and the discretionary share.

    Both are shares of a period TOTAL rather than rates, so the month in
    progress belongs in them -- hence ``today`` is unused here. It stays in the
    signature so every generator is interchangeable from the engine's view.
    """
    del today
    insights: list[Insight] = []
    expenses = expenses_of(transactions)
    if not expenses:
        return insights

    category_totals = calculator.group_by_category(expenses)
    concentration = calculator.calculate_category_concentration(category_totals)
    if concentration > CATEGORY_CONCENTRATION_ALERT_PCT:
        top_category = max(category_totals.items(), key=lambda x: x[1])
        insights.append(
            build_insight(
                "High Category Concentration",
                f"Your top category '{top_category[0]}' accounts for "
                f"{concentration:.1f}% of total expenses "
                f"({sym}{top_category[1]:,.0f}).",
                "info",
            )
        )

    convenience = calculator.calculate_convenience_spending(expenses)
    if convenience["convenience_pct"] > CONVENIENCE_SPENDING_ALERT_PCT:
        insights.append(
            build_insight(
                "Significant Convenience Spending",
                f"You spent {convenience['convenience_pct']:.1f}% "
                f"({sym}{convenience['convenience_amount']:,.0f}) on "
                f"discretionary categories like shopping, dining, and entertainment.",
                "info",
            )
        )
    return insights
