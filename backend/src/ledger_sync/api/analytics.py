"""Analytics API endpoints for insights and statistics."""

from typing import Annotated, Any

from fastapi import APIRouter, Query

from ledger_sync.api.analytics_helpers import (
    _get_sql_account_totals,
    _get_sql_monthly_data,
    _get_sql_totals,
    get_filtered_transactions,
)
from ledger_sync.api.analytics_metrics import behavior_metrics, kpi_metrics, trend_metrics
from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core import calculator
from ledger_sync.core.query_helpers import capital_loss_keys_for
from ledger_sync.core.time_filter import TimeRange

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

TIME_RANGE_FILTER_DESC = "Time range filter"


@router.get("/overview")
def get_overview(
    current_user: CurrentUser,
    db: DatabaseSession,
    time_range: Annotated[
        TimeRange, Query(description=TIME_RANGE_FILTER_DESC)
    ] = TimeRange.ALL_TIME,
) -> dict[str, Any]:
    """Get overview statistics: income, expenses, net change, best/worst month.

    ``capital_losses`` is published as its own figure and is already netted out
    of ``net_change`` by ``_get_sql_totals``, so this response reconciles with
    ``/api/calculations/totals`` (``net_change == net_savings``) instead of
    overstating the net position by the loss amount.
    """
    totals = _get_sql_totals(db, current_user, time_range)

    if totals["transaction_count"] == 0:
        return {
            "total_income": 0,
            "total_expenses": 0,
            "capital_losses": 0,
            "net_change": 0,
            "best_month": None,
            "worst_month": None,
            "asset_allocation": [],
            "transaction_count": 0,
        }

    # SQL-based aggregations
    monthly_data = _get_sql_monthly_data(db, current_user, time_range)
    best_worst = calculator.find_best_worst_months(monthly_data)
    account_activity = _get_sql_account_totals(db, current_user, time_range)

    # Format asset allocation
    asset_allocation: list[dict[str, Any]] = [
        {"account": account, "balance": activity} for account, activity in account_activity.items()
    ]
    asset_allocation.sort(key=lambda x: float(x["balance"]), reverse=True)

    return {
        "total_income": totals["total_income"],
        "total_expenses": totals["total_expenses"],
        "capital_losses": totals["capital_losses"],
        "net_change": totals["net_change"],
        "best_month": best_worst["best_month"],
        "worst_month": best_worst["worst_month"],
        "asset_allocation": asset_allocation,
        "transaction_count": totals["transaction_count"],
    }


@router.get("/behavior")
def get_behavior(
    current_user: CurrentUser,
    db: DatabaseSession,
    time_range: Annotated[
        TimeRange, Query(description=TIME_RANGE_FILTER_DESC)
    ] = TimeRange.ALL_TIME,
) -> dict[str, Any]:
    """Get spending behavior metrics."""
    transactions = get_filtered_transactions(db, current_user, time_range)
    return behavior_metrics(transactions, capital_loss_keys_for(current_user))


@router.get("/trends")
def get_trends(
    current_user: CurrentUser,
    db: DatabaseSession,
    time_range: Annotated[
        TimeRange, Query(description=TIME_RANGE_FILTER_DESC)
    ] = TimeRange.ALL_TIME,
) -> dict[str, Any]:
    """Get spending and income trends over time.

    ``consistency_score`` carries ``consistency_measurable``: the score function
    returns a flat 100.0 when a coefficient of variation is undefined (one month
    of history, or a zero mean), and 100 reads as the BEST possible result. A
    client that renders the number without checking the flag tells a brand-new
    user their spending is perfectly consistent.
    """
    transactions = get_filtered_transactions(db, current_user, time_range)
    return trend_metrics(transactions, capital_loss_keys_for(current_user))


@router.get("/kpis")
def get_kpis(
    current_user: CurrentUser,
    db: DatabaseSession,
    time_range: Annotated[
        TimeRange, Query(description=TIME_RANGE_FILTER_DESC)
    ] = TimeRange.ALL_TIME,
) -> dict[str, Any]:
    """Get all KPI metrics in one call.

    Two of these numbers have an undefined case that returns a plausible-looking
    value rather than an error, so each ships with a companion flag:

    * ``consistency_measurable`` -- ``consistency_score`` is a flat 100.0 (the
      BEST possible reading) whenever a coefficient of variation is undefined.
    * ``velocity_comparable`` -- ``spending_velocity`` is 0.0 when there is no
      history outside the recent window, which reads as "spending is 100% down".

    A client that renders either number without its flag reports a conclusion the
    data does not support.
    """
    transactions = get_filtered_transactions(db, current_user, time_range)
    return kpi_metrics(transactions, capital_loss_keys_for(current_user))
