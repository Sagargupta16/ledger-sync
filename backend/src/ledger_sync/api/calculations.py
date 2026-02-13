"""Calculation API endpoints - All financial calculations."""

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from ledger_sync.api.analytics import _apply_earning_start_date
from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import Transaction, TransactionType, User

router = APIRouter(prefix="/api/calculations", tags=["calculations"])

# Annotated type aliases for common query parameters
OptionalStartDate = Annotated[datetime | None, Query()]
OptionalEndDate = Annotated[datetime | None, Query()]
OptionalTransactionType = Annotated[
    str | None, Query(description="Filter by type: Income or Expense")
]


def _build_calc_base_query(
    db: Session,
    user: User,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> "Query":
    """Build a filtered base query for calculations endpoints.

    Applies user_id, is_deleted, earning_start_date and optional date-range
    filters.  Callers add column expressions / GROUP BY on top.
    """
    start_date = _apply_earning_start_date(user, start_date)

    query = db.query(Transaction).filter(
        Transaction.user_id == user.id,
        Transaction.is_deleted.is_(False),
    )

    if start_date:
        query = query.filter(Transaction.date >= start_date)
    if end_date:
        query = query.filter(Transaction.date <= end_date)

    return query


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


def _format_largest_transaction(largest: Transaction | None) -> dict[str, Any] | None:
    """Format largest transaction data."""
    if not largest:
        return None
    return {
        "amount": float(largest.amount),
        "category": largest.category or "",
        "date": largest.date.isoformat(),
    }


def get_transactions(
    db: Session,
    user: User,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> list[Transaction]:
    """Get non-deleted transactions for a user, optionally filtered by date range."""
    start_date = _apply_earning_start_date(user, start_date)

    query = db.query(Transaction).filter(
        Transaction.user_id == user.id,
        Transaction.is_deleted.is_(False),
    )

    if start_date:
        query = query.filter(Transaction.date >= start_date)
    if end_date:
        query = query.filter(Transaction.date <= end_date)

    return query.all()


@router.get("/totals")
def get_totals(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
) -> dict[str, Any]:
    """Calculate total income, expenses, and net savings."""
    base = _build_calc_base_query(db, current_user, start_date, end_date).subquery()

    row = db.query(
        func.coalesce(
            func.sum(
                case(
                    (base.c.type == TransactionType.INCOME, base.c.amount),
                    else_=0,
                )
            ),
            0,
        ).label("total_income"),
        func.coalesce(
            func.sum(
                case(
                    (base.c.type == TransactionType.EXPENSE, base.c.amount),
                    else_=0,
                )
            ),
            0,
        ).label("total_expenses"),
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
    """Calculate monthly income and expense aggregation."""
    base = _build_calc_base_query(db, current_user, start_date, end_date).subquery()
    month_col = func.strftime("%Y-%m", base.c.date).label("month")

    rows = (
        db.query(
            month_col,
            func.coalesce(
                func.sum(
                    case(
                        (base.c.type == TransactionType.INCOME, base.c.amount),
                        else_=0,
                    )
                ),
                0,
            ).label("income"),
            func.coalesce(
                func.sum(
                    case(
                        (base.c.type == TransactionType.EXPENSE, base.c.amount),
                        else_=0,
                    )
                ),
                0,
            ).label("expense"),
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
    base = _build_calc_base_query(db, current_user, start_date, end_date).subquery()
    year_col = func.strftime("%Y", base.c.date).label("year")

    rows = (
        db.query(
            year_col,
            func.coalesce(
                func.sum(
                    case(
                        (base.c.type == TransactionType.INCOME, base.c.amount),
                        else_=0,
                    )
                ),
                0,
            ).label("income"),
            func.coalesce(
                func.sum(
                    case(
                        (base.c.type == TransactionType.EXPENSE, base.c.amount),
                        else_=0,
                    )
                ),
                0,
            ).label("expense"),
            func.count().label("transactions"),
        )
        .group_by(year_col)
        .all()
    )

    # Fetch distinct months per year for the "months" list
    month_detail_rows = (
        db.query(
            func.strftime("%Y", base.c.date).label("year"),
            func.strftime("%m", base.c.date).label("month"),
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
    """Calculate spending/income breakdown by category and subcategory."""
    query = _build_calc_base_query(db, current_user, start_date, end_date)

    # Filter by type if specified
    if transaction_type:
        tx_type = (
            TransactionType.INCOME
            if transaction_type.lower() == "income"
            else TransactionType.EXPENSE
        )
        query = query.filter(Transaction.type == tx_type)

    base = query.subquery()

    # Aggregate by category and subcategory in SQL
    rows = (
        db.query(
            func.coalesce(base.c.category, "Uncategorized").label("category"),
            func.coalesce(base.c.subcategory, "Other").label("subcategory"),
            func.coalesce(func.sum(base.c.amount), 0).label("total"),
            func.count().label("count"),
        )
        .group_by(
            func.coalesce(base.c.category, "Uncategorized"),
            func.coalesce(base.c.subcategory, "Other"),
        )
        .all()
    )

    # Build the nested category_data structure from flat SQL rows
    category_data: dict[str, dict[str, Any]] = {}
    for row in rows:
        cat = row.category
        subcat = row.subcategory
        amount = float(row.total)
        count = row.count

        if cat not in category_data:
            category_data[cat] = {
                "total": 0.0,
                "count": 0,
                "subcategories": {},
            }

        category_data[cat]["total"] += amount
        category_data[cat]["count"] += count
        category_data[cat]["subcategories"][subcat] = amount

    # Calculate percentages
    total_amount = sum(cat_info["total"] for cat_info in category_data.values())

    for category in category_data:
        category_data[category]["percentage"] = (
            (category_data[category]["total"] / total_amount * 100) if total_amount > 0 else 0
        )

    return {
        "categories": category_data,
        "total": total_amount,
    }


def _ensure_account(balances: dict[str, dict[str, Any]], account: str) -> None:
    """Initialize an account entry in the balances dict if it does not exist."""
    if account not in balances:
        balances[account] = {
            "balance": 0,
            "transactions": 0,
            "last_transaction": None,
        }


def _update_last_transaction_date(account_info: dict[str, Any], tx_date: datetime) -> None:
    """Update last_transaction date if the given date is more recent."""
    if account_info["last_transaction"] is None or tx_date > account_info["last_transaction"]:
        account_info["last_transaction"] = tx_date


def _process_regular_transactions(
    transactions: list[Transaction],
    balances: dict[str, dict[str, Any]],
) -> None:
    """Accumulate balances for income and expense transactions.

    Skips transfer transactions — those are handled by _process_transfer_transactions.
    """
    for tx in transactions:
        if tx.type == TransactionType.TRANSFER:
            continue

        account = tx.account or "Unknown"
        _ensure_account(balances, account)

        amount = abs(float(tx.amount))
        if tx.type == TransactionType.INCOME:
            balances[account]["balance"] += amount
        elif tx.type == TransactionType.EXPENSE:
            balances[account]["balance"] -= amount

        balances[account]["transactions"] += 1
        _update_last_transaction_date(balances[account], tx.date)


def _process_transfer_transactions(
    transactions: list[Transaction],
    balances: dict[str, dict[str, Any]],
) -> None:
    """Apply transfer transactions: debit source, credit destination."""
    transfer_txs = [tx for tx in transactions if tx.type == TransactionType.TRANSFER]
    for tx in transfer_txs:
        amount = abs(float(tx.amount))
        src = tx.from_account or "Unknown"
        dst = tx.to_account or "Unknown"

        for acc in (src, dst):
            _ensure_account(balances, acc)

        balances[src]["balance"] -= amount
        balances[dst]["balance"] += amount

        for acc in (src, dst):
            balances[acc]["transactions"] += 1
            _update_last_transaction_date(balances[acc], tx.date)


def _compute_account_statistics(
    balances: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Compute summary statistics and serialize account data for the response."""
    total_balance = sum(acc["balance"] for acc in balances.values())
    total_accounts = len(balances)
    average_balance = total_balance / total_accounts if total_accounts > 0 else 0
    positive_accounts = sum(1 for acc in balances.values() if acc["balance"] > 0)
    negative_accounts = sum(1 for acc in balances.values() if acc["balance"] < 0)

    serialized_accounts: dict[str, dict[str, Any]] = {}
    for acc, info in balances.items():
        serialized_accounts[acc] = {
            "balance": info["balance"],
            "transactions": info["transactions"],
            "last_transaction": (
                info["last_transaction"].isoformat() if info["last_transaction"] else None
            ),
        }

    return {
        "accounts": serialized_accounts,
        "statistics": {
            "total_accounts": total_accounts,
            "total_balance": total_balance,
            "average_balance": average_balance,
            "positive_accounts": positive_accounts,
            "negative_accounts": negative_accounts,
        },
    }


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


def _build_category_analysis(
    expenses: list[Transaction],
) -> tuple[dict[str, float], dict[str, int]]:
    """Accumulate expense totals and counts per category."""
    category_totals: dict[str, float] = {}
    category_counts: dict[str, int] = {}
    for tx in expenses:
        cat = tx.category or "Uncategorized"
        category_totals[cat] = category_totals.get(cat, 0) + float(tx.amount)
        category_counts[cat] = category_counts.get(cat, 0) + 1
    return category_totals, category_counts


def _find_unusual_spending(
    expenses: list[Transaction],
    category_totals: dict[str, float],
    category_counts: dict[str, int],
) -> list[dict[str, Any]]:
    """Identify transactions exceeding 2x their category average, returning top 5."""
    unusual: list[dict[str, Any]] = []
    for category, total in category_totals.items():
        avg_amount = total / category_counts[category]
        threshold = avg_amount * 2

        for tx in expenses:
            if (tx.category or "Uncategorized") != category:
                continue
            tx_amount = float(tx.amount)
            if tx_amount > threshold:
                unusual.append(
                    {
                        "category": category,
                        "amount": tx_amount,
                        "average_amount": avg_amount,
                        "deviation": ((tx_amount - avg_amount) / avg_amount * 100),
                        "date": tx.date.isoformat(),
                    },
                )
    return unusual[:5]


def _calculate_expense_averages(
    total_expenses: float,
    start_date: datetime | None,
    end_date: datetime | None,
) -> tuple[float, float]:
    """Return (average_daily_expense, average_monthly_expense)."""
    day_count = (end_date - start_date).days if start_date and end_date else 30
    month_count = max(day_count / 30.44, 1)  # 365.25/12 avg days per month
    average_daily = total_expenses / day_count if day_count > 0 else 0
    average_monthly = total_expenses / month_count if month_count > 0 else 0
    return average_daily, average_monthly


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
    base = _build_calc_base_query(db, current_user, start_date, end_date).subquery()
    date_col = func.strftime("%Y-%m-%d", base.c.date).label("date_key")

    rows = (
        db.query(
            date_col,
            func.coalesce(
                func.sum(
                    case(
                        (base.c.type == TransactionType.INCOME, base.c.amount),
                        else_=0,
                    )
                ),
                0,
            ).label("income"),
            func.coalesce(
                func.sum(
                    case(
                        (base.c.type == TransactionType.EXPENSE, base.c.amount),
                        else_=0,
                    )
                ),
                0,
            ).label("expense"),
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
    query = _build_calc_base_query(db, current_user, start_date, end_date)

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
