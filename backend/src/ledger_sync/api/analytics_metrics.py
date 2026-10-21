"""In-memory metric builders behind the ``/api/analytics`` router.

Extracted from ``analytics.py`` so the router keeps only routes. Each builder
takes the already-filtered transactions plus the user's classified
realised-loss keys and returns the endpoint's response body. The loss rule is
the same everywhere: a classified loss is not spending, so every spending
metric runs on ``exclude_capital_losses``; savings and surplus still net it
off, because the cash left.

Monthly averages (burn rate, spending frequency, lifestyle inflation windows,
the consistency score's monthly series) use complete calendar months only, with
empty months as 0 and the month in progress left out -- see ``core.calculator``.
*today* defaults to the IST ledger day and is injectable for tests.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date
from typing import Any

from ledger_sync.core import calculator
from ledger_sync.core.calculator import LedgerRow
from ledger_sync.core.ledger_clock import ledger_today


def _complete_monthly_expenses(
    monthly_data: dict[str, dict[str, float]], today: date
) -> list[float]:
    """Monthly expense series over complete calendar months, empty months as 0."""
    return [
        data["expenses"] for data in calculator.fill_complete_months(monthly_data, today).values()
    ]


def behavior_metrics(
    transactions: Sequence[LedgerRow], loss_keys: set[str], *, today: date | None = None
) -> dict[str, Any]:
    """``/behavior``: average size, frequency, convenience share, top categories."""
    reference = today or ledger_today()
    if not transactions:
        return {
            "avg_transaction_size": 0,
            "spending_frequency": 0,
            "convenience_spending_pct": 0,
            "lifestyle_inflation": 0,
            "top_categories": [],
        }

    # Every metric here describes spending, so classified realised losses are
    # dropped first, matching /overview.
    spending = calculator.exclude_capital_losses(transactions, loss_keys)
    lifestyle_inf = calculator.calculate_lifestyle_inflation(spending, reference)
    convenience_data = calculator.calculate_convenience_spending(spending)
    convenience_pct = convenience_data["convenience_pct"]
    category_totals = calculator.group_by_category(spending)

    # Calculate average transaction size and frequency (specific to this endpoint)
    expenses = calculator.expense_rows(spending)
    if not expenses:
        return {
            "avg_transaction_size": 0,
            "spending_frequency": 0,
            "convenience_spending_pct": convenience_pct,
            "lifestyle_inflation": lifestyle_inf,
            "top_categories": [],
        }

    avg_transaction_size = sum(float(t.amount) for t in expenses) / len(expenses)

    # Spending frequency: expense transactions per complete calendar month.
    spending_frequency = calculator.calculate_spending_frequency(expenses, reference)

    # Top spending categories
    top_categories: list[dict[str, Any]] = [
        {"category": cat, "amount": amt}
        for cat, amt in category_totals.items()
        if cat  # Only include expense categories
    ]
    top_categories.sort(key=lambda x: float(x["amount"]), reverse=True)

    return {
        "avg_transaction_size": avg_transaction_size,
        "spending_frequency": spending_frequency,
        "convenience_spending_pct": convenience_pct,
        "lifestyle_inflation": lifestyle_inf,
        "top_categories": top_categories[:10],
    }


def trend_metrics(
    transactions: Sequence[LedgerRow], loss_keys: set[str], *, today: date | None = None
) -> dict[str, Any]:
    """``/trends``: monthly income/expense/surplus rows and a consistency score.

    The rows list every month with data, the month in progress included; the
    consistency score reads the complete-month series instead, because its mean
    is a monthly average.
    """
    if not transactions:
        return {
            "monthly_trends": [],
            "surplus_trend": [],
            "consistency_score": 0,
            "consistency_measurable": False,
        }

    # Classified realised losses leave ``expenses`` (they are not spending) but
    # still reduce ``surplus``, as on /overview's ``net_change``.
    monthly_data = calculator.group_by_month(transactions, loss_keys)
    monthly_expenses = _complete_monthly_expenses(monthly_data, today or ledger_today())
    consistency_score = calculator.calculate_consistency_score(monthly_expenses)
    consistency_measurable = calculator.is_measurable_consistency(monthly_expenses)

    # Format monthly trends
    monthly_trends = [
        {
            "month": month,
            "income": data["income"],
            "expenses": data["expenses"],
            "capital_losses": data["capital_losses"],
            "surplus": data["income"] - data["expenses"] - data["capital_losses"],
        }
        for month, data in sorted(monthly_data.items())
    ]

    # Surplus trend for easy charting
    surplus_trend = [
        {
            "month": trend["month"],
            "surplus": trend["surplus"],
        }
        for trend in monthly_trends
    ]

    return {
        "monthly_trends": monthly_trends,
        "surplus_trend": surplus_trend,
        "consistency_score": consistency_score,
        "consistency_measurable": consistency_measurable,
    }


def kpi_metrics(
    transactions: Sequence[LedgerRow], loss_keys: set[str], *, today: date | None = None
) -> dict[str, Any]:
    """``/kpis``: every KPI plus the two measurability flags."""
    reference = today or ledger_today()
    if not transactions:
        return {
            "savings_rate": 0,
            "daily_spending_rate": 0,
            "monthly_burn_rate": 0,
            "spending_velocity": 0,
            "velocity_comparable": False,
            "category_concentration": 0,
            "consistency_score": 0,
            "consistency_measurable": False,
            "lifestyle_inflation": 0,
            "convenience_spending_pct": 0,
        }

    # Spending metrics skip classified realised losses; the savings rate still
    # nets them off because the cash left (monthly_summaries.savings_rate).
    spending = calculator.exclude_capital_losses(transactions, loss_keys)
    totals = calculator.calculate_totals(transactions, loss_keys)
    monthly_expenses = _complete_monthly_expenses(calculator.group_by_month(spending), reference)
    category_totals = calculator.group_by_category(spending)
    spending_velocity = calculator.calculate_spending_velocity(spending)
    convenience_data = calculator.calculate_convenience_spending(spending)

    return {
        "savings_rate": calculator.calculate_savings_rate(
            totals["total_income"],
            totals["total_expenses"] + totals["capital_losses"],
        ),
        "daily_spending_rate": calculator.calculate_daily_spending_rate(spending),
        "monthly_burn_rate": calculator.calculate_monthly_burn_rate(spending, reference),
        "spending_velocity": spending_velocity["velocity_ratio"]
        * 100,  # Convert ratio to percentage
        "velocity_comparable": spending_velocity["historical_daily"] > 0,
        "category_concentration": calculator.calculate_category_concentration(
            category_totals,
        ),
        "consistency_score": calculator.calculate_consistency_score(monthly_expenses),
        "consistency_measurable": calculator.is_measurable_consistency(monthly_expenses),
        "lifestyle_inflation": calculator.calculate_lifestyle_inflation(spending, reference),
        "convenience_spending_pct": convenience_data["convenience_pct"],
    }
