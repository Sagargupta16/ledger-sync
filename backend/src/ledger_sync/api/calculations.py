"""Calculation API endpoints - All financial calculations."""

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy import func

from ledger_sync.api.calculations_helpers import (
    _build_category_analysis,
    _build_category_data_from_rows,
    _build_category_data_from_trends,
    _calculate_expense_averages,
    _compute_account_statistics,
    _find_unusual_spending,
    _format_largest_transaction,
    _process_regular_transactions,
    _process_transfer_transactions,
    _resolve_transaction_type,
    get_transactions,
)
from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.query_helpers import (
    build_transaction_query,
    expense_sum_col,
    fmt_date,
    fmt_month,
    fmt_year,
    fmt_year_month,
    income_sum_col,
)
from ledger_sync.db.models import (
    CategoryTrend,
    MonthlySummary,
    Transaction,
    TransactionType,
)

router = APIRouter(prefix="/api/calculations", tags=["calculations"])

# Annotated type aliases for common query parameters
OptionalStartDate = Annotated[datetime | None, Query()]
OptionalEndDate = Annotated[datetime | None, Query()]
OptionalTransactionType = Annotated[
    str | None, Query(description="Filter by type: Income or Expense")
]


@router.get("/categories/master")
def get_master_categories(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, Any]:
    """Get all unique categories and subcategories organized by transaction type.

    Returns a hierarchical structure of all categories used in the system,
    grouped by Income/Expense type, with subcategories under each category.

    Returns:
        {
            "income": {
                "Salary": ["Basic", "Bonus", "Allowances"],
                "Investment Returns": ["Dividends", "Interest"],
                ...
            },
            "expense": {
                "Groceries": ["Vegetables", "Dairy"],
                "Rent": ["Housing"],
                ...
            }
        }

    """
    result: dict[str, dict[str, list[str]]] = {
        "income": {},
        "expense": {},
    }

    # Use SELECT DISTINCT to fetch only unique (type, category, subcategory) tuples
    rows = (
        db.query(
            Transaction.type,
            Transaction.category,
            Transaction.subcategory,
        )
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.is_deleted.is_(False),
            Transaction.type.in_([TransactionType.INCOME, TransactionType.EXPENSE]),
        )
        .distinct()
        .all()
    )

    for tx_type, category, subcategory in rows:
        type_key = "income" if tx_type == TransactionType.INCOME else "expense"
        cat = category or "Uncategorized"
        subcat = subcategory or "Other"

        if cat not in result[type_key]:
            result[type_key][cat] = []

        if subcat not in result[type_key][cat]:
            result[type_key][cat].append(subcat)

    # Sort subcategories for consistency
    for tx_type in result:
        for category in result[tx_type]:
            result[tx_type][category].sort()
        # Sort categories alphabetically
        sorted_categories = dict(sorted(result[tx_type].items()))
        result[tx_type] = sorted_categories

    return result


@router.get("/totals")
def get_totals(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
) -> dict[str, Any]:
    """Calculate total income, expenses, and net savings.

    Fast path: when no date filters are provided, reads from pre-computed
    monthly_summaries table instead of scanning all raw transactions.
    """
    # Fast path: aggregate from monthly_summaries when no date filter
    if start_date is None and end_date is None:
        summaries = (
            db.query(
                func.coalesce(func.sum(MonthlySummary.total_income), 0).label("total_income"),
                func.coalesce(func.sum(MonthlySummary.total_expenses), 0).label("total_expenses"),
                func.coalesce(func.sum(MonthlySummary.total_transactions), 0).label("tx_count"),
            )
            .filter(MonthlySummary.user_id == current_user.id)
            .one()
        )
        if summaries.tx_count > 0:
            total_income = float(summaries.total_income)
            total_expenses = float(summaries.total_expenses)
            net_savings = total_income - total_expenses
            savings_rate = (net_savings / total_income * 100) if total_income > 0 else 0
            return {
                "total_income": total_income,
                "total_expenses": total_expenses,
                "net_savings": net_savings,
                "savings_rate": savings_rate,
                "transaction_count": summaries.tx_count,
            }

    # Fallback: compute from raw transactions with date filters
    base = build_transaction_query(db, current_user, start_date, end_date).subquery()

    row = db.query(
        income_sum_col(base),
        expense_sum_col(base),
        func.count().label("transaction_count"),
    ).one()

    total_income = float(row.total_income)
    total_expenses = float(row.total_expenses)
    net_savings = total_income - total_expenses
    savings_rate = (net_savings / total_income * 100) if total_income > 0 else 0

    return {
        "total_income": total_income,
        "total_expenses": total_expenses,
        "net_savings": net_savings,
        "savings_rate": savings_rate,
        "transaction_count": row.transaction_count,
    }


@router.get("/monthly-aggregation")
def get_monthly_aggregation(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
) -> dict[str, Any]:
    """Calculate monthly income and expense aggregation.

    Fast path: reads directly from monthly_summaries when no date filter.
    """
    # Fast path: read from pre-computed monthly_summaries
    if start_date is None and end_date is None:
        summaries = (
            db.query(MonthlySummary)
            .filter(MonthlySummary.user_id == current_user.id)
            .order_by(MonthlySummary.period_key)
            .all()
        )
        if summaries:
            return {
                s.period_key: {
                    "income": float(s.total_income),
                    "expense": float(s.total_expenses),
                    "net_savings": float(s.net_savings),
                    "transactions": s.total_transactions,
                }
                for s in summaries
            }

    # Fallback: compute from raw transactions with date filters
    base = build_transaction_query(db, current_user, start_date, end_date).subquery()
    month_col = fmt_year_month(base.c.date).label("month")

    rows = (
        db.query(
            month_col,
            income_sum_col(base, label="income"),
            expense_sum_col(base, label="expense"),
            func.count().label("transactions"),
        )
        .group_by(month_col)
        .all()
    )

    monthly_data: dict[str, dict[str, float]] = {}
    for row in rows:
        income = float(row.income)
        expense = float(row.expense)
        monthly_data[row.month] = {
            "income": income,
            "expense": expense,
            "net_savings": income - expense,
            "transactions": row.transactions,
        }

    return monthly_data


@router.get("/yearly-aggregation")
def get_yearly_aggregation(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
) -> dict[str, Any]:
    """Calculate yearly income and expense aggregation."""
    base = build_transaction_query(db, current_user, start_date, end_date).subquery()
    year_col = fmt_year(base.c.date).label("year")

    rows = (
        db.query(
            year_col,
            income_sum_col(base, label="income"),
            expense_sum_col(base, label="expense"),
            func.count().label("transactions"),
        )
        .group_by(year_col)
        .all()
    )

    # Fetch distinct months per year for the "months" list
    month_detail_rows = (
        db.query(
            fmt_year(base.c.date).label("year"),
            fmt_month(base.c.date).label("month"),
        )
        .distinct()
        .all()
    )

    year_months: dict[str, list[int]] = {}
    for yr, mn in month_detail_rows:
        year_months.setdefault(yr, []).append(int(mn))

    yearly_data: dict[str, dict[str, Any]] = {}
    for row in rows:
        income = float(row.income)
        expense = float(row.expense)
        yearly_data[row.year] = {
            "income": income,
            "expense": expense,
            "net_savings": income - expense,
            "transactions": row.transactions,
            "months": sorted(year_months.get(row.year, [])),
        }

    return yearly_data


@router.get("/category-breakdown")
def get_category_breakdown(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
    transaction_type: OptionalTransactionType = None,
) -> dict[str, Any]:
    """Calculate spending/income breakdown by category and subcategory.

    Fast path: reads from category_trends when no date filter.
    """
    tx_type = _resolve_transaction_type(transaction_type)

    # Fast path: aggregate from category_trends when no date filter
    if start_date is None and end_date is None:
        ct_query = db.query(CategoryTrend).filter(CategoryTrend.user_id == current_user.id)
        if tx_type:
            ct_query = ct_query.filter(CategoryTrend.transaction_type == tx_type)
        trends = ct_query.all()
        if trends:
            return _build_category_data_from_trends(trends)

    # Fallback: compute from raw transactions with date filters
    query = build_transaction_query(db, current_user, start_date, end_date)
    if tx_type:
        query = query.filter(Transaction.type == tx_type)

    base = query.subquery()
    cat_col = func.coalesce(base.c.category, "Uncategorized")
    subcat_col = func.coalesce(base.c.subcategory, "Other")

    rows = (
        db.query(
            cat_col.label("category"),
            subcat_col.label("subcategory"),
            func.coalesce(func.sum(base.c.amount), 0).label("total"),
            func.count().label("count"),
        )
        .group_by(cat_col, subcat_col)
        .all()
    )

    return _build_category_data_from_rows(rows)


@router.get("/account-balances")
def get_account_balances(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
) -> dict[str, Any]:
    """Calculate current balance for each account including transfers."""
    transactions = get_transactions(db, current_user, start_date, end_date)

    account_balances: dict[str, dict[str, Any]] = {}
    _process_regular_transactions(transactions, account_balances)
    _process_transfer_transactions(transactions, account_balances)

    return _compute_account_statistics(account_balances)


@router.get("/insights")
def get_financial_insights(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
) -> dict[str, Any]:
    """Calculate comprehensive financial insights."""
    transactions = get_transactions(db, current_user, start_date, end_date)

    expenses = [tx for tx in transactions if tx.type == TransactionType.EXPENSE]
    income = [tx for tx in transactions if tx.type == TransactionType.INCOME]

    total_income = sum(float(tx.amount) for tx in income)
    total_expenses = sum(float(tx.amount) for tx in expenses)

    category_totals, category_counts = _build_category_analysis(expenses)

    top_category = max(category_totals.items(), key=lambda x: x[1]) if category_totals else ("", 0)
    most_frequent = max(category_counts.items(), key=lambda x: x[1]) if category_counts else ("", 0)

    average_daily_expense, average_monthly_expense = _calculate_expense_averages(
        total_expenses, start_date, end_date
    )
    savings_rate = ((total_income - total_expenses) / total_income * 100) if total_income > 0 else 0
    largest = max(expenses, key=lambda tx: float(tx.amount)) if expenses else None
    unusual_spending = _find_unusual_spending(expenses, category_totals, category_counts)

    return {
        "top_expense_category": {
            "category": top_category[0],
            "amount": top_category[1],
            "percentage": ((top_category[1] / total_expenses * 100) if total_expenses > 0 else 0),
        },
        "most_frequent_category": {
            "category": most_frequent[0],
            "count": most_frequent[1],
        },
        "average_daily_expense": average_daily_expense,
        "average_monthly_expense": average_monthly_expense,
        "savings_rate": savings_rate,
        "largest_transaction": _format_largest_transaction(largest),
        "unusual_spending": unusual_spending,
        "total_income": total_income,
        "total_expenses": total_expenses,
    }


@router.get("/daily-net-worth")
def get_daily_net_worth(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
) -> dict[str, Any]:
    """Calculate daily income and expense data for net worth trends."""
    base = build_transaction_query(db, current_user, start_date, end_date).subquery()
    date_col = fmt_date(base.c.date).label("date_key")

    rows = (
        db.query(
            date_col,
            income_sum_col(base, label="income"),
            expense_sum_col(base, label="expense"),
        )
        .group_by(date_col)
        .order_by(date_col)
        .all()
    )

    daily_data: dict[str, dict[str, float]] = {}
    cumulative_net_worth = 0.0
    cumulative_data = []

    for row in rows:
        income = float(row.income)
        expense = float(row.expense)
        daily_data[row.date_key] = {
            "income": income,
            "expense": expense,
            "date": row.date_key,
        }
        cumulative_net_worth += income - expense
        cumulative_data.append(
            {
                "date": row.date_key,
                "net_worth": cumulative_net_worth,
                "income": income,
                "expense": expense,
            },
        )

    return {
        "daily_data": daily_data,
        "cumulative_data": cumulative_data,
    }


@router.get("/top-categories")
def get_top_categories(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
    transaction_type: OptionalTransactionType = None,
) -> list[dict[str, Any]]:
    """Get top N categories by amount."""
    query = build_transaction_query(db, current_user, start_date, end_date)

    # Filter by type if specified
    if transaction_type:
        tx_type = (
            TransactionType.INCOME
            if transaction_type.lower() == "income"
            else TransactionType.EXPENSE
        )
        query = query.filter(Transaction.type == tx_type)

    base = query.subquery()
    cat_col = func.coalesce(base.c.category, "Uncategorized").label("category")

    rows = (
        db.query(
            cat_col,
            func.coalesce(func.sum(base.c.amount), 0).label("amount"),
            func.count().label("count"),
        )
        .group_by(cat_col)
        .order_by(func.sum(base.c.amount).desc())
        .limit(limit)
        .all()
    )

    # We need the grand total (not just top-N total) for accurate percentages.
    grand_total_row = db.query(
        func.coalesce(func.sum(base.c.amount), 0).label("grand_total"),
    ).one()
    grand_total = float(grand_total_row.grand_total)

    return [
        {
            "category": row.category,
            "amount": float(row.amount),
            "percentage": (float(row.amount) / grand_total * 100) if grand_total > 0 else 0,
            "count": row.count,
        }
        for row in rows
    ]
