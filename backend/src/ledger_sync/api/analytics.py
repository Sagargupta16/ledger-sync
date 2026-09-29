"""Analytics API endpoints for insights and statistics."""

from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.api.analytics_helpers import (
    _get_sql_account_totals,
    _get_sql_category_totals,
    _get_sql_monthly_data,
    _get_sql_totals,
    get_filtered_transactions,
)
from ledger_sync.api.analytics_metrics import (
    behavior_metrics,
    kpi_metrics,
    trend_metrics,
    wrapped_insights,
)
from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core import calculator
from ledger_sync.core.query_helpers import capital_loss_keys_for
from ledger_sync.core.time_filter import TimeRange
from ledger_sync.db.models import User, UserPreferences

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

TIME_RANGE_FILTER_DESC = "Time range filter"


def _load_preferences(db: Session, user: User) -> UserPreferences | None:
    """Read a user's preferences row, or ``None`` when they have none yet.

    Read-only counterpart to ``preferences_helpers._get_or_create_preferences``:
    a GET must not write a defaults row as a side effect. Consumers treat
    ``None`` as "use the shipped defaults", so a missing row is not an error.
    """
    stmt = select(UserPreferences).where(UserPreferences.user_id == user.id).limit(1)
    return db.execute(stmt).scalar_one_or_none()


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


@router.get("/wrapped")
def get_yearly_wrapped(
    current_user: CurrentUser,
    db: DatabaseSession,
    time_range: Annotated[
        TimeRange, Query(description=TIME_RANGE_FILTER_DESC)
    ] = TimeRange.ALL_TIME,
) -> dict[str, Any]:
    """Get yearly wrapped insights - text-based narratives."""
    transactions = get_filtered_transactions(db, current_user, time_range)
    return {"insights": wrapped_insights(transactions, capital_loss_keys_for(current_user))}


# New Enhanced Endpoints for Phase 2 Expansion


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


@router.get("/charts/income-expense")
def get_income_expense_chart(
    current_user: CurrentUser,
    db: DatabaseSession,
    time_range: Annotated[
        TimeRange, Query(description=TIME_RANGE_FILTER_DESC)
    ] = TimeRange.ALL_TIME,
) -> dict[str, Any]:
    """Get data for income vs expense doughnut chart.

    A classified realised loss gets its own slice. Dropping it from "Expenses"
    without adding it back left the chart short by the loss amount, so the two
    slices no longer accounted for where the money went. The slice is omitted
    entirely when nothing is classified, which is every user's default state.
    """
    totals = _get_sql_totals(db, current_user, time_range)

    data: list[dict[str, Any]] = [
        {"name": "Income", "value": totals["total_income"]},
        {"name": "Expenses", "value": totals["total_expenses"]},
    ]
    if totals["capital_losses"]:
        data.append({"name": "Capital Losses", "value": totals["capital_losses"]})

    return {"data": data}


@router.get("/charts/categories")
def get_categories_chart(
    current_user: CurrentUser,
    db: DatabaseSession,
    time_range: Annotated[
        TimeRange, Query(description=TIME_RANGE_FILTER_DESC)
    ] = TimeRange.ALL_TIME,
    limit: Annotated[int, Query(description="Number of top categories to return")] = 10,
) -> dict[str, Any]:
    """Get data for top categories bar chart."""
    category_totals = _get_sql_category_totals(db, current_user, time_range)

    # Sort and limit
    sorted_categories = sorted(category_totals.items(), key=lambda x: x[1], reverse=True)[:limit]

    return {"data": [{"category": cat, "amount": amt} for cat, amt in sorted_categories]}


@router.get("/charts/monthly-trends")
def get_monthly_trends_chart(
    current_user: CurrentUser,
    db: DatabaseSession,
    time_range: Annotated[
        TimeRange, Query(description=TIME_RANGE_FILTER_DESC)
    ] = TimeRange.ALL_TIME,
) -> dict[str, Any]:
    """Get data for monthly trends line chart.

    ``net`` subtracts ``capital_losses`` as well as ``expenses``: the loss is not
    consumption but the cash did leave, so a per-month ``income - expenses`` net
    would sit above the user's real balance change by exactly the loss.
    """
    monthly_data = _get_sql_monthly_data(db, current_user, time_range)

    # Format for line chart
    chart_data = [
        {
            "month": month,
            "income": data["income"],
            "expenses": data["expenses"],
            "capital_losses": data["capital_losses"],
            "net": data["income"] - data["expenses"] - data["capital_losses"],
        }
        for month, data in sorted(monthly_data.items())
    ]

    return {"data": chart_data}


@router.get("/charts/account-distribution")
def get_account_distribution_chart(
    current_user: CurrentUser,
    db: DatabaseSession,
    time_range: Annotated[
        TimeRange, Query(description=TIME_RANGE_FILTER_DESC)
    ] = TimeRange.ALL_TIME,
) -> dict[str, Any]:
    """Get data for account distribution doughnut chart."""
    account_totals = _get_sql_account_totals(db, current_user, time_range)

    # Sort by value
    sorted_accounts = sorted(account_totals.items(), key=lambda x: x[1], reverse=True)

    return {"data": [{"account": acc, "value": amt} for acc, amt in sorted_accounts]}


@router.get("/insights/generated")
def get_generated_insights(
    current_user: CurrentUser,
    db: DatabaseSession,
    time_range: Annotated[
        TimeRange, Query(description=TIME_RANGE_FILTER_DESC)
    ] = TimeRange.ALL_TIME,
) -> dict[str, Any]:
    """Get AI-generated insights from transaction data.

    The user's preferences row is loaded so every amount in every insight string
    carries THEIR display symbol. Constructing the engine with no argument
    silently resolved to the shipped default, so a user on USD read
    rupee-prefixed figures. The row is read, never created: this is a GET.
    """
    from ledger_sync.core.insights import InsightEngine

    transactions = get_filtered_transactions(db, current_user, time_range)

    if not transactions:
        return {"insights": []}

    # Classified realised losses are not spending (see InsightEngine).
    engine = InsightEngine(
        _load_preferences(db, current_user), loss_keys=capital_loss_keys_for(current_user)
    )
    insights = engine.generate_all_insights(transactions)

    return {"insights": insights}
