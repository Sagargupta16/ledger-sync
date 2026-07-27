"""The two time-based written-insight generators.

Split from ``insight_generators`` (which keeps the two amount-shape generators)
purely for file size. These are the two that compare periods against each other,
so they are also the two the month-in-progress corrupts, and both take their
reference date from the caller rather than the clock.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from ledger_sync.core import calculator
from ledger_sync.core.insight_builder import Insight, build_insight, expenses_of
from ledger_sync.core.insight_rules import (
    LIFESTYLE_DEFLATION_POSITIVE_PCT,
    LIFESTYLE_INFLATION_ALERT_PCT,
    RECENT_MONTHS_WINDOW,
    SPENDING_TREND_DOWN_RATIO,
    SPENDING_TREND_UP_RATIO,
    SPENDING_VELOCITY_DOWN_RATIO,
    SPENDING_VELOCITY_UP_RATIO,
    completed_month_expenses,
    completed_monthly_data,
)

if TYPE_CHECKING:
    from datetime import date

    from ledger_sync.db.models import Transaction


def temporal_insights(transactions: list[Transaction], sym: str, today: date) -> list[Insight]:
    """Recent-window spending trend and the best month by surplus.

    Every figure here is an average or a ranking, so the whole generator runs on
    completed months. With only the in-progress month present the completed set
    is empty and both halves abstain, which is the honest answer.
    """
    insights: list[Insight] = []
    if not transactions:
        return insights

    monthly_data = completed_monthly_data(calculator.group_by_month(transactions), today)
    if len(monthly_data) >= RECENT_MONTHS_WINDOW:
        sorted_months = sorted(monthly_data.items())
        recent = sorted_months[-RECENT_MONTHS_WINDOW:]
        # Divide by the months actually in the slice, never by the window
        # constant: the two diverge the moment the guard above is relaxed.
        recent_avg = sum(m[1]["expenses"] for m in recent) / len(recent)
        overall_avg = sum(m[1]["expenses"] for m in sorted_months) / len(sorted_months)
        # Interpolated, never spelled out: the copy used to read "your last 3
        # months" beside a constant, so changing the window made the text lie.
        window = len(recent)

        if recent_avg > overall_avg * SPENDING_TREND_UP_RATIO:
            insights.append(
                build_insight(
                    "Spending Trending Upward",
                    f"Your last {window} months average ({sym}{recent_avg:,.0f}) is "
                    f"{((recent_avg / overall_avg - 1) * 100):.1f}% higher "
                    f"than your overall average.",
                    "warning",
                )
            )
        elif recent_avg < overall_avg * SPENDING_TREND_DOWN_RATIO:
            insights.append(
                build_insight(
                    "Spending Trending Downward",
                    f"Your last {window} months average ({sym}{recent_avg:,.0f}) is "
                    f"{((1 - recent_avg / overall_avg) * 100):.1f}% lower "
                    f"than your overall average.",
                    "positive",
                )
            )

    best = calculator.find_best_worst_months(monthly_data)["best_month"]
    # A deficit is not a surplus. Every month can be negative, and the old
    # unconditional emit then announced a "Best Financial Month" with a
    # "surplus" of a negative number under a positive severity.
    if best and best["surplus"] > 0:
        insights.append(
            build_insight(
                "Best Financial Month",
                f"Your best month was {best['month']} "
                f"with a surplus of {sym}{best['surplus']:,.0f}.",
                "positive",
            )
        )
    return insights


def behavioral_insights(transactions: list[Transaction], sym: str, today: date) -> list[Insight]:
    """Lifestyle inflation across the history and the recent spending velocity."""
    insights: list[Insight] = []
    expenses = expenses_of(transactions)
    if not expenses:
        return insights

    # Both windows are calendar-month averages, so a half-finished trailing
    # month drags the late window down and reports a reduction never made.
    inflation = calculator.calculate_lifestyle_inflation(
        completed_month_expenses(transactions, today)
    )
    if inflation > LIFESTYLE_INFLATION_ALERT_PCT:
        insights.append(
            build_insight(
                "Lifestyle Inflation Detected",
                f"Your average spending has increased by {inflation:.1f}% "
                f"compared to your early months. This is normal with income "
                f"growth, but worth monitoring.",
                "info",
            )
        )
    elif inflation < LIFESTYLE_DEFLATION_POSITIVE_PCT:
        insights.append(
            build_insight(
                "Spending Reduction",
                f"Your average spending has decreased by {abs(inflation):.1f}% "
                f"compared to your early months. Great job on cutting expenses!",
                "positive",
            )
        )

    # Day-anchored rolling windows, not calendar months, so the partial month is
    # not a distortion here.
    velocity = calculator.calculate_spending_velocity(expenses)
    ratio = velocity["velocity_ratio"]
    # ``historical_daily == 0`` means there is no history to compare against,
    # and the ratio comes back 0.0 for it. Read as a value it trips the DOWN
    # threshold and claims spending is "100.0% lower than your historical
    # average" -- for a user whose entire ledger is inside the recent window.
    if velocity["historical_daily"] <= 0:
        return insights
    if ratio > SPENDING_VELOCITY_UP_RATIO:
        insights.append(
            build_insight(
                "Accelerated Recent Spending",
                f"Your recent daily spending ({sym}{velocity['recent_daily']:,.0f}) "
                f"is {((ratio - 1) * 100):.1f}% higher "
                f"than your historical average.",
                "warning",
            )
        )
    elif ratio < SPENDING_VELOCITY_DOWN_RATIO:
        insights.append(
            build_insight(
                "Reduced Recent Spending",
                f"Your recent daily spending ({sym}{velocity['recent_daily']:,.0f}) "
                f"is {((1 - ratio) * 100):.1f}% lower "
                f"than your historical average.",
                "positive",
            )
        )
    return insights
