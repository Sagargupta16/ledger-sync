"""V2 endpoints: monthly, daily, investment holdings, category trends, transfer flows.

Data health lives in ``summaries_health`` and holdings/trends/flows in
``summaries_flows``; both are mounted on this router at the end of the module,
so the route order is unchanged.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy import desc

from ledger_sync.api.analytics_v2_impl.summaries_flows import router as flows_router
from ledger_sync.api.analytics_v2_impl.summaries_health import router as health_router
from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import (
    CohortSpending,
    DailySummary,
    MonthlySummary,
)

router = APIRouter()


@router.get("/monthly-summaries")
def get_monthly_summaries(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_period: Annotated[str | None, Query(description="Start period (YYYY-MM)")] = None,
    end_period: Annotated[str | None, Query(description="End period (YYYY-MM)")] = None,
    limit: Annotated[int, Query(ge=1, le=600, description="Number of months to return")] = 120,
) -> dict[str, Any]:
    """Get pre-calculated monthly summaries.

    Returns comprehensive monthly data including:
    - Income breakdown (salary, investment, other)
    - Expense breakdown (essential vs discretionary)
    - Savings metrics
    - Month-over-month changes

    Earning-start-date is deliberately NOT applied here. This endpoint
    returns factual monthly aggregates; view-window cropping belongs on
    the frontend chart layer, not in the data source.
    """
    query = (
        db.query(MonthlySummary)
        .filter(MonthlySummary.user_id == current_user.id)
        .order_by(desc(MonthlySummary.period_key))
    )

    if start_period:
        query = query.filter(MonthlySummary.period_key >= start_period)
    if end_period:
        query = query.filter(MonthlySummary.period_key <= end_period)

    summaries = query.limit(limit).all()

    return {
        "data": [
            {
                "period": s.period_key,
                "year": s.year,
                "month": s.month,
                "income": {
                    "total": float(s.total_income),
                    "salary": float(s.salary_income),
                    "investment": float(s.investment_income),
                    "other": float(s.other_income),
                    "count": s.income_count,
                    "change_pct": s.income_change_pct,
                },
                "expenses": {
                    "total": float(s.total_expenses),
                    "essential": float(s.essential_expenses),
                    "discretionary": float(s.discretionary_expenses),
                    "count": s.expense_count,
                    "change_pct": s.expense_change_pct,
                },
                # Realised investment losses the user classified. Reported
                # alongside expenses rather than inside them: the money left but
                # nothing was consumed, so it is out of "total" above and out of
                # ``expense_ratio`` (the consumption share), while ``savings.net``
                # and ``savings.rate`` -- which is net over income, same
                # definition it always had -- both still net it off.
                "capital_losses": float(s.capital_losses),
                "transfers": {
                    "out": float(s.total_transfers_out),
                    "in": float(s.total_transfers_in),
                    "net_investment": float(s.net_investment_flow),
                    "count": s.transfer_count,
                },
                "savings": {
                    "net": float(s.net_savings),
                    "rate": s.savings_rate,
                },
                "expense_ratio": s.expense_ratio,
                "total_transactions": s.total_transactions,
                "last_calculated": (s.last_calculated.isoformat() if s.last_calculated else None),
            }
            for s in summaries
        ],
        "count": len(summaries),
    }


@router.get("/daily-summaries")
def get_daily_summaries(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: Annotated[str | None, Query(description="Start date (YYYY-MM-DD)")] = None,
    end_date: Annotated[str | None, Query(description="End date (YYYY-MM-DD)")] = None,
    limit: Annotated[int, Query(ge=1, le=3000, description="Max days to return")] = 1500,
) -> dict[str, Any]:
    """Get pre-calculated daily summaries.

    Used by YearInReview heatmap and daily trend charts.
    Returns daily income/expense/net totals with transaction counts.

    Earning-start-date is deliberately NOT applied here. View-window
    cropping belongs on the frontend chart layer.
    """
    query = db.query(DailySummary).filter(DailySummary.user_id == current_user.id)

    if start_date:
        query = query.filter(DailySummary.date >= start_date)
    if end_date:
        query = query.filter(DailySummary.date <= end_date)

    # Order desc + limit to get most recent days, then reverse for chronological output
    days = query.order_by(DailySummary.date.desc()).limit(limit).all()
    days.reverse()

    return {
        "data": [
            {
                "date": d.date,
                "income": float(d.total_income),
                "expense": float(d.total_expenses),
                "net": float(d.net),
                "income_count": d.income_count,
                "expense_count": d.expense_count,
                "transfer_count": d.transfer_count,
                "total_transactions": d.total_transactions,
                "top_category": d.top_category,
            }
            for d in days
        ],
        "count": len(days),
    }


# Python weekday() is Mon=0..Sun=6; the frontend chart orders Sun..Sat (JS
# getDay). Map at the API boundary so the client renders rows directly.
_PY_WEEKDAY_TO_JS = {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0}


@router.get("/cohort-spending")
def get_cohort_spending(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, Any]:
    """Get pre-calculated average-spend cohorts.

    Three dimensions, each with an occurrence-correct divisor baked into
    ``avg`` (see ``CohortSpending``):
    - ``day_of_week``: bucket 0=Sun..6=Sat (mapped from Python's Mon=0)
    - ``day_of_month``: bucket 1..31
    - ``month_of_year``: bucket 1..12

    Replaces the client-side bucketing that pulled every transaction; also
    removes the timezone bug class (dates are extracted server-side from the
    stored naive local date).
    """
    rows = db.query(CohortSpending).filter(CohortSpending.user_id == current_user.id).all()

    result: dict[str, list[dict[str, Any]]] = {
        "day_of_week": [],
        "day_of_month": [],
        "month_of_year": [],
    }
    for r in rows:
        bucket = _PY_WEEKDAY_TO_JS[r.bucket] if r.dimension == "day_of_week" else r.bucket
        result.setdefault(r.dimension, []).append(
            {
                "bucket": bucket,
                "total": float(r.total_amount),
                "occurrences": r.occurrences,
                "avg": float(r.avg_amount),
            }
        )

    for buckets in result.values():
        buckets.sort(key=lambda b: b["bucket"])

    return {"data": result}


# Mounted after the routes above so the router lists every route in its
# original order: data health, then holdings, category trends, transfer flows.
router.include_router(health_router)
router.include_router(flows_router)
