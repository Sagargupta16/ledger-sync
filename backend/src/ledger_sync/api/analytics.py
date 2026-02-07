"""Analytics API endpoints for insights and statistics."""

import calendar
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy.orm import Session

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.calculator import FinancialCalculator
from ledger_sync.core.time_filter import TimeRange
from ledger_sync.db.models import Transaction, TransactionType, User

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

# Constants
TIME_RANGE_FILTER_DESC = "Time range filter"


def _subtract_months(dt: datetime, months: int) -> datetime:
    """Subtract N calendar months from a datetime, clamping to valid day."""
    month = dt.month - months
    year = dt.year + (month - 1) // 12
    month = (month - 1) % 12 + 1
    # Clamp day to last valid day of target month
    max_day = calendar.monthrange(year, month)[1]
    day = min(dt.day, max_day)
    return dt.replace(year=year, month=month, day=day)


def _get_time_range_dates(
    db: Session,
    user: User,
    time_range: TimeRange,
) -> tuple[datetime | None, datetime | None]:
    """Calculate start/end dates from a TimeRange enum using the DB-level max date.

    Returns (start_date, end_date) or (None, None) for ALL_TIME.
    """
    if time_range == TimeRange.ALL_TIME:
        return None, None

    latest = (
        db.query(Transaction.date)
        .filter(Transaction.user_id == user.id, Transaction.is_deleted.is_(False))
        .order_by(Transaction.date.desc())
        .first()
    )
    if not latest:
        return None, None

    latest_date = latest[0]
    end_date = None

    if time_range == TimeRange.THIS_MONTH:
        start_date = latest_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif time_range == TimeRange.LAST_MONTH:
        first_of_month = latest_date.replace(day=1)
        last_month_end = first_of_month - timedelta(days=1)
        start_date = last_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_date = last_month_end
    elif time_range == TimeRange.LAST_3_MONTHS:
        start_date = _subtract_months(latest_date, 3)
    elif time_range == TimeRange.LAST_6_MONTHS:
        start_date = _subtract_months(latest_date, 6)
    elif time_range == TimeRange.LAST_12_MONTHS:
        start_date = _subtract_months(latest_date, 12)
    elif time_range == TimeRange.THIS_YEAR:
        start_date = latest_date.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    elif time_range == TimeRange.LAST_YEAR:
        year = latest_date.year - 1
        start_date = datetime(year, 1, 1, tzinfo=UTC)
        end_date = datetime(year, 12, 31, 23, 59, 59, tzinfo=UTC)
    elif time_range == TimeRange.LAST_DECADE:
        start_date = _subtract_months(latest_date, 120)
    else:
        return None, None

    return start_date, end_date


def get_filtered_transactions(
    db: Session,
    user: User,
    time_range: TimeRange = TimeRange.ALL_TIME,
) -> list[Transaction]:
    """Get non-deleted transactions filtered by time range at the DB level."""
    query = db.query(Transaction).filter(
        Transaction.user_id == user.id, Transaction.is_deleted.is_(False)
    )

    start_date, end_date = _get_time_range_dates(db, user, time_range)
    if start_date:
        query = query.filter(Transaction.date >= start_date)
    if end_date:
        query = query.filter(Transaction.date <= end_date)

    return query.all()


@router.get("/overview")
def get_overview(
    current_user: CurrentUser,
    db: DatabaseSession,
    time_range: Annotated[
        TimeRange, Query(description=TIME_RANGE_FILTER_DESC)
    ] = TimeRange.ALL_TIME,
) -> dict[str, Any]:
    """Get overview statistics: income, expenses, net change, best/worst month."""
    transactions = get_filtered_transactions(db, current_user, time_range)

    if not transactions:
        return {
            "total_income": 0,
            "total_expenses": 0,
            "net_change": 0,
            "best_month": None,
            "worst_month": None,
            "asset_allocation": [],
            "transaction_count": 0,
        }

    # Use calculator for metrics
    totals = FinancialCalculator.calculate_totals(transactions)
    monthly_data = FinancialCalculator.group_by_month(transactions)
    best_worst = FinancialCalculator.find_best_worst_months(monthly_data)
    account_activity = FinancialCalculator.group_by_account(transactions)

    # Format asset allocation
    asset_allocation = [
        {"account": account, "balance": activity} for account, activity in account_activity.items()
    ]
    asset_allocation.sort(key=lambda x: x["balance"], reverse=True)

    return {
        "total_income": totals["total_income"],
        "total_expenses": totals["total_expenses"],
        "net_change": totals["net_change"],
        "best_month": best_worst["best_month"],
        "worst_month": best_worst["worst_month"],
        "asset_allocation": asset_allocation,
        "transaction_count": len(transactions),
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

    if not transactions:
        return {
            "avg_transaction_size": 0,
            "spending_frequency": 0,
            "convenience_spending_pct": 0,
            "lifestyle_inflation": 0,
            "top_categories": [],
        }

    # Use calculator for metrics
    lifestyle_inf = FinancialCalculator.calculate_lifestyle_inflation(transactions)
    convenience_data = FinancialCalculator.calculate_convenience_spending(transactions)
    convenience_pct = convenience_data["convenience_pct"]
    category_totals = FinancialCalculator.group_by_category(transactions)

    # Calculate average transaction size and frequency (specific to this endpoint)
    expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]
    if not expenses:
        return {
            "avg_transaction_size": 0,
            "spending_frequency": 0,
            "convenience_spending_pct": convenience_pct,
            "lifestyle_inflation": lifestyle_inf,
            "top_categories": [],
        }

    avg_transaction_size = sum(float(t.amount) for t in expenses) / len(expenses)

    # Spending frequency (transactions per month)
    dates = [t.date for t in expenses]
    min_date = min(dates)
    max_date = max(dates)
    months_span = (max_date.year - min_date.year) * 12 + (max_date.month - min_date.month) + 1
    spending_frequency = len(expenses) / months_span if months_span > 0 else 0

    # Top spending categories
    top_categories = [
        {"category": cat, "amount": amt}
        for cat, amt in category_totals.items()
        if cat  # Only include expense categories
    ]
    top_categories.sort(key=lambda x: x["amount"], reverse=True)

    return {
        "avg_transaction_size": avg_transaction_size,
        "spending_frequency": spending_frequency,
        "convenience_spending_pct": convenience_pct,
        "lifestyle_inflation": lifestyle_inf,
        "top_categories": top_categories[:10],
    }


@router.get("/trends")
def get_trends(
    current_user: CurrentUser,
    db: DatabaseSession,
    time_range: Annotated[
        TimeRange, Query(description=TIME_RANGE_FILTER_DESC)
    ] = TimeRange.ALL_TIME,
) -> dict[str, Any]:
    """Get spending and income trends over time."""
    transactions = get_filtered_transactions(db, current_user, time_range)

    if not transactions:
        return {
            "monthly_trends": [],
            "surplus_trend": [],
            "consistency_score": 0,
        }

    # Use calculator for metrics
    monthly_data = FinancialCalculator.group_by_month(transactions)
    monthly_expenses = [data["expenses"] for data in monthly_data.values()]
    consistency_score = FinancialCalculator.calculate_consistency_score(monthly_expenses)

    # Format monthly trends
    monthly_trends = [
        {
            "month": month,
            "income": data["income"],
            "expenses": data["expenses"],
            "surplus": data["income"] - data["expenses"],
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
    }


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

    if not transactions:
        return {"insights": []}

    # Use calculator for metrics
    totals = FinancialCalculator.calculate_totals(transactions)
    monthly_data = FinancialCalculator.group_by_month(transactions)
    best_worst = FinancialCalculator.find_best_worst_months(monthly_data)
    savings_rate = FinancialCalculator.calculate_savings_rate(
        totals["total_income"],
        totals["total_expenses"],
    )
    daily_rate = FinancialCalculator.calculate_daily_spending_rate(transactions)

    expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]
    income_txns = [t for t in transactions if t.type == TransactionType.INCOME]

    insights = []

    # Total spending insight
    insights.append(
        {
            "title": "Total Spending",
            "value": f"₹{totals['total_expenses']:,.2f}",
            "description": (
                f"You spent ₹{totals['total_expenses']:,.2f} "
                f"across {len(expenses)} transactions"
            ),
        },
    )

    # Total income insight
    insights.append(
        {
            "title": "Total Income",
            "value": f"₹{totals['total_income']:,.2f}",
            "description": (
                f"You earned ₹{totals['total_income']:,.2f} from {len(income_txns)} sources"
            ),
        },
    )

    # Biggest expense
    if expenses:
        biggest = max(expenses, key=lambda t: float(t.amount))
        insights.append(
            {
                "title": "Biggest Expense",
                "value": f"₹{float(biggest.amount):,.2f}",
                "description": (
                    f"Your largest expense was ₹{float(biggest.amount):,.2f} "
                    f"in {biggest.category}"
                ),
            },
        )

    # Most frequent category
    if expenses:
        category_counts: dict[str, int] = {}
        for t in expenses:
            category_counts[t.category] = category_counts.get(t.category, 0) + 1
        most_frequent = max(category_counts.items(), key=lambda x: x[1])
        insights.append(
            {
                "title": "Most Frequent Category",
                "value": most_frequent[0],
                "description": (f"You made {most_frequent[1]} transactions in {most_frequent[0]}"),
            },
        )

    # Best month
    if best_worst["best_month"]:
        best = best_worst["best_month"]
        insights.append(
            {
                "title": "Best Month",
                "value": best["month"],
                "description": (
                    f"Your best month was {best['month']} "
                    f"with a surplus of ₹{best['surplus']:,.2f}"
                ),
            },
        )

    # Savings rate
    insights.append(
        {
            "title": "Savings Rate",
            "value": f"{savings_rate:.1f}%",
            "description": f"You saved {savings_rate:.1f}% of your income",
        },
    )

    # Daily average spending
    insights.append(
        {
            "title": "Daily Average",
            "value": f"₹{daily_rate:,.2f}",
            "description": f"You spent an average of ₹{daily_rate:,.2f} per day",
        },
    )

    return {"insights": insights}


# New Enhanced Endpoints for Phase 2 Expansion


@router.get("/kpis")
def get_kpis(
    current_user: CurrentUser,
    db: DatabaseSession,
    time_range: Annotated[
        TimeRange, Query(description=TIME_RANGE_FILTER_DESC)
    ] = TimeRange.ALL_TIME,
) -> dict[str, Any]:
    """Get all KPI metrics in one call."""
    transactions = get_filtered_transactions(db, current_user, time_range)

    if not transactions:
        return {
            "savings_rate": 0,
            "daily_spending_rate": 0,
            "monthly_burn_rate": 0,
            "spending_velocity": 0,
            "category_concentration": 0,
            "consistency_score": 0,
            "lifestyle_inflation": 0,
            "convenience_spending_pct": 0,
        }

    totals = FinancialCalculator.calculate_totals(transactions)
    monthly_data = FinancialCalculator.group_by_month(transactions)
    monthly_expenses = [data["expenses"] for data in monthly_data.values()]
    category_totals = FinancialCalculator.group_by_category(transactions)
    spending_velocity = FinancialCalculator.calculate_spending_velocity(transactions)
    convenience_data = FinancialCalculator.calculate_convenience_spending(transactions)

    return {
        "savings_rate": FinancialCalculator.calculate_savings_rate(
            totals["total_income"],
            totals["total_expenses"],
        ),
        "daily_spending_rate": FinancialCalculator.calculate_daily_spending_rate(transactions),
        "monthly_burn_rate": FinancialCalculator.calculate_monthly_burn_rate(transactions),
        "spending_velocity": spending_velocity["velocity_ratio"]
        * 100,  # Convert ratio to percentage
        "category_concentration": FinancialCalculator.calculate_category_concentration(
            category_totals,
        ),
        "consistency_score": FinancialCalculator.calculate_consistency_score(monthly_expenses),
        "lifestyle_inflation": FinancialCalculator.calculate_lifestyle_inflation(transactions),
        "convenience_spending_pct": convenience_data["convenience_pct"],
    }


@router.get("/charts/income-expense")
def get_income_expense_chart(
    current_user: CurrentUser,
    db: DatabaseSession,
    time_range: Annotated[
        TimeRange, Query(description=TIME_RANGE_FILTER_DESC)
    ] = TimeRange.ALL_TIME,
) -> dict[str, Any]:
    """Get data for income vs expense doughnut chart."""
    transactions = get_filtered_transactions(db, current_user, time_range)
    totals = FinancialCalculator.calculate_totals(transactions)

    return {
        "data": [
            {"name": "Income", "value": totals["total_income"]},
            {"name": "Expenses", "value": totals["total_expenses"]},
        ],
    }


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
    transactions = get_filtered_transactions(db, current_user, time_range)
    category_totals = FinancialCalculator.group_by_category(transactions)

    # Sort and limit
    sorted_categories = sorted(category_totals.items(), key=lambda x: x[1], reverse=True)[:limit]

    return {"data": [{"category": cat, "amount": amt} for cat, amt in sorted_categories]}


@router.get("/charts/monthly-trends")
def get_monthly_trends_chart(
    current_user: CurrentUser,
    db: DatabaseSession,
    time_range: Annotated[
        TimeRange, Query(description=TIME_RANGE_FILTER_DESC)
    ] = TimeRange.LAST_12_MONTHS,
) -> dict[str, Any]:
    """Get data for monthly trends line chart."""
    transactions = get_filtered_transactions(db, current_user, time_range)
    monthly_data = FinancialCalculator.group_by_month(transactions)

    # Format for line chart
    chart_data = [
        {
            "month": month,
            "income": data["income"],
            "expenses": data["expenses"],
            "net": data["income"] - data["expenses"],
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
    transactions = get_filtered_transactions(db, current_user, time_range)
    account_totals = FinancialCalculator.group_by_account(transactions)

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
    """Get AI-generated insights from transaction data."""
    from ledger_sync.core.insights import InsightEngine

    transactions = get_filtered_transactions(db, current_user, time_range)

    if not transactions:
        return {"insights": []}

    engine = InsightEngine()
    insights = engine.generate_all_insights(transactions)

    return {"insights": insights}
