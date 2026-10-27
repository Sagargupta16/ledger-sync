"""``computeAnalysis``: the period figures the FinHealth and CFP scorers read.

Port of ``computeAnalysis`` (``frontend/src/components/analytics/health/
healthScoreAnalysis.ts``) over the month buckets ``dashboard_metrics_health``
fills, returning the browser's numbers to the last bit (see
``dashboard_metrics_base`` for the arithmetic rules). One helper per section of
the TypeScript function, each flow summed in month order.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from ledger_sync.core.dashboard_metrics_base import (
    VOLATILITY_MONTHS,
    running_sum,
    savings_rate_percent,
    share_percent,
    weighted_cv,
)


@dataclass(slots=True)
class MonthBucket:
    """One month's flows, or the whole ledger's (``MonthlyBucket``)."""

    income: float = 0.0
    expense: float = 0.0
    debt: float = 0.0
    inflow: float = 0.0
    outflow: float = 0.0
    essential: float = 0.0


def _pooled(buckets: Sequence[MonthBucket]) -> MonthBucket:
    """The period's totals (``sumFlows`` and the reduces), each flow summed in month order."""
    return MonthBucket(
        income=running_sum(b.income for b in buckets),
        expense=running_sum(b.expense for b in buckets),
        debt=running_sum(b.debt for b in buckets),
        inflow=running_sum(b.inflow for b in buckets),
        outflow=running_sum(b.outflow for b in buckets),
        essential=running_sum(b.essential for b in buckets),
    )


def _lifetime_position(
    lifetime: MonthBucket, balances: Mapping[str, float] | None
) -> tuple[dict[str, float], float]:
    """The lifetime flow proxies, and the liquid money the emergency fund divides.

    Recorded balances win; without any, ``liquidAssetsFromFlows`` takes the
    cumulative savings that were not invested.
    """
    cumulative = lifetime.income - lifetime.expense
    invested = lifetime.inflow - lifetime.outflow
    flow_totals = {
        "cumulative_net_savings": cumulative,
        "net_investments": invested,
        "total_debt_outstanding": lifetime.debt,
    }
    liquid = balances["liquid_assets"] if balances else max(0.0, cumulative - max(0.0, invested))
    return flow_totals, liquid


def _debt_trend_percent(buckets: Sequence[MonthBucket]) -> float:
    """The second half's average monthly debt against the first half's, in percent."""
    half = len(buckets) // 2
    first = running_sum(b.debt for b in buckets[:half]) / (half or 1)
    second = running_sum(b.debt for b in buckets[half:]) / ((len(buckets) - half) or 1)
    if first > 0:
        return ((second - first) / first) * 100
    return 100.0 if second > 0 else 0.0


def _recent_stability(buckets: Sequence[MonthBucket]) -> dict[str, Any]:
    """Recency-weighted savings and income volatility over the last 12 months."""
    recent = buckets[-VOLATILITY_MONTHS:]
    return {
        "has_recent_income": any(b.income > 0 for b in recent),
        "savings_volatility_cv": weighted_cv(
            [savings_rate_percent(b.income, b.expense) for b in recent]
        ),
        "income_cv": weighted_cv([b.income for b in recent]),
    }


def compute_analysis(
    buckets: Sequence[MonthBucket],
    lifetime: MonthBucket,
    balances: Mapping[str, float] | None,
) -> dict[str, Any]:
    """``computeAnalysis`` over the period's months, with lifetime balance proxies."""
    count = len(buckets)
    total = _pooled(buckets)
    flow_totals, liquid = _lifetime_position(lifetime, balances)
    avg_expense = total.expense / count
    invested_months = sum(1 for b in buckets if b.inflow - b.outflow > 0)
    saving_months = sum(1 for b in buckets if savings_rate_percent(b.income, b.expense) > 0)
    return {
        "balance_flow_totals": flow_totals,
        "months_analyzed": count,
        "savings_rate": savings_rate_percent(total.income, total.expense),
        "essential_to_income_ratio": share_percent(total.essential, total.income, 100.0),
        "total_income": total.income,
        "total_expense": total.expense,
        "total_essential_expense": total.essential,
        "total_debt": total.debt,
        "avg_monthly_income": total.income / count,
        "avg_monthly_expense": avg_expense,
        "avg_monthly_essential_expense": total.essential / count,
        "emergency_fund_months": liquid / avg_expense if avg_expense > 0 else 0.0,
        "cumulative_net_savings": flow_totals["cumulative_net_savings"],
        "investment_regularity": invested_months / count,
        "investment_to_income_ratio": share_percent(
            total.inflow - total.outflow, total.income, 0.0
        ),
        "total_investment_inflow": total.inflow,
        "total_investment_outflow": total.outflow,
        "debt_to_income_ratio": share_percent(total.debt, total.income, 0.0),
        "avg_monthly_debt": total.debt / count,
        "debt_trend_percent": _debt_trend_percent(buckets),
        "positive_savings_ratio": saving_months / count,
        **_recent_stability(buckets),
        "balances": balances,
    }
