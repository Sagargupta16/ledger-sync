"""Calculation API endpoints - All financial calculations."""

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Query
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

    # Get all transactions for this user
    transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == current_user.id, Transaction.is_deleted.is_(False))
        .all()
    )

    # Process transactions to extract categories and subcategories
    for tx in transactions:
        tx_type = "income" if tx.type == TransactionType.INCOME else "expense"
        category = tx.category or "Uncategorized"
        subcategory = tx.subcategory or "Other"

        # Initialize category if not exists
        if category not in result[tx_type]:
            result[tx_type][category] = []

        # Add subcategory if not already present
        if subcategory not in result[tx_type][category]:
            result[tx_type][category].append(subcategory)

    # Get transfers (they don't have income/expense distinction, but track separately if needed)
    # For now, we'll skip transfers from category listing since they're movements,
    # not income/expense

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
    transactions = get_transactions(db, current_user, start_date, end_date)

    from decimal import Decimal

    total_income = sum(
        (Decimal(str(tx.amount)) for tx in transactions if tx.type == TransactionType.INCOME),
        Decimal(0),
    )
    total_expenses = sum(
        (Decimal(str(tx.amount)) for tx in transactions if tx.type == TransactionType.EXPENSE),
        Decimal(0),
    )
    net_savings = total_income - total_expenses
    savings_rate = float(net_savings / total_income * 100) if total_income > 0 else 0

    return {
        "total_income": float(total_income),
        "total_expenses": float(total_expenses),
        "net_savings": float(net_savings),
        "savings_rate": savings_rate,
        "transaction_count": len(transactions),
    }


@router.get("/monthly-aggregation")
def get_monthly_aggregation(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
) -> dict[str, Any]:
    """Calculate monthly income and expense aggregation."""
    transactions = get_transactions(db, current_user, start_date, end_date)

    from decimal import Decimal

    monthly_accum: dict[str, dict[str, Any]] = {}

    for tx in transactions:
        month_key = tx.date.strftime("%Y-%m")

        if month_key not in monthly_accum:
            monthly_accum[month_key] = {
                "income": Decimal(0),
                "expense": Decimal(0),
                "transactions": 0,
            }

        if tx.type == TransactionType.INCOME:
            monthly_accum[month_key]["income"] += Decimal(str(tx.amount))
        elif tx.type == TransactionType.EXPENSE:
            monthly_accum[month_key]["expense"] += Decimal(str(tx.amount))

        monthly_accum[month_key]["transactions"] += 1

    # Convert to float for JSON response and calculate net savings
    monthly_data: dict[str, dict[str, float]] = {}
    for month_key, data in monthly_accum.items():
        income = float(data["income"])
        expense = float(data["expense"])
        monthly_data[month_key] = {
            "income": income,
            "expense": expense,
            "net_savings": income - expense,
            "transactions": data["transactions"],
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
    transactions = get_transactions(db, current_user, start_date, end_date)

    from decimal import Decimal

    yearly_accum: dict[str, dict[str, Any]] = {}

    for tx in transactions:
        year = str(tx.date.year)
        month = tx.date.month

        if year not in yearly_accum:
            yearly_accum[year] = {
                "income": Decimal(0),
                "expense": Decimal(0),
                "transactions": 0,
                "months": set(),
            }

        if tx.type == TransactionType.INCOME:
            yearly_accum[year]["income"] += Decimal(str(tx.amount))
        elif tx.type == TransactionType.EXPENSE:
            yearly_accum[year]["expense"] += Decimal(str(tx.amount))

        yearly_accum[year]["transactions"] += 1
        yearly_accum[year]["months"].add(month)

    # Convert to float for JSON response
    yearly_data: dict[str, dict[str, Any]] = {}
    for year, data in yearly_accum.items():
        income = float(data["income"])
        expense = float(data["expense"])
        yearly_data[year] = {
            "income": income,
            "expense": expense,
            "net_savings": income - expense,
            "transactions": data["transactions"],
            "months": sorted(data["months"]),
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
    transactions = get_transactions(db, current_user, start_date, end_date)

    # Filter by type if specified
    if transaction_type:
        tx_type = (
            TransactionType.INCOME
            if transaction_type.lower() == "income"
            else TransactionType.EXPENSE
        )
        transactions = [tx for tx in transactions if tx.type == tx_type]

    category_data: dict[str, dict[str, Any]] = {}

    for tx in transactions:
        category = tx.category or "Uncategorized"
        subcategory = tx.subcategory or "Other"

        if category not in category_data:
            category_data[category] = {
                "total": 0,
                "count": 0,
                "subcategories": {},
            }

        category_data[category]["total"] += float(tx.amount)  # Already float from DB Numeric
        category_data[category]["count"] += 1

        if subcategory not in category_data[category]["subcategories"]:
            category_data[category]["subcategories"][subcategory] = 0.0

        category_data[category]["subcategories"][subcategory] += float(tx.amount)

    # Calculate percentages
    total_amount = sum(cat["total"] for cat in category_data.values())

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
    transactions = get_transactions(db, current_user, start_date, end_date)

    daily_data: dict[str, dict[str, float]] = {}

    for tx in transactions:
        date_key = tx.date.strftime("%Y-%m-%d")

        if date_key not in daily_data:
            daily_data[date_key] = {
                "income": 0,
                "expense": 0,
                "date": date_key,
            }

        if tx.type == TransactionType.INCOME:
            daily_data[date_key]["income"] += float(tx.amount)
        elif tx.type == TransactionType.EXPENSE:
            daily_data[date_key]["expense"] += float(tx.amount)
        # Transfers don't affect net worth (money moves between own accounts)

    # Calculate cumulative net worth
    sorted_dates = sorted(daily_data.keys())
    cumulative_net_worth = 0
    cumulative_data = []

    for date_key in sorted_dates:
        cumulative_net_worth += daily_data[date_key]["income"] - daily_data[date_key]["expense"]
        cumulative_data.append(
            {
                "date": date_key,
                "net_worth": cumulative_net_worth,
                "income": daily_data[date_key]["income"],
                "expense": daily_data[date_key]["expense"],
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
    transactions = get_transactions(db, current_user, start_date, end_date)

    # Filter by type if specified
    if transaction_type:
        tx_type = (
            TransactionType.INCOME
            if transaction_type.lower() == "income"
            else TransactionType.EXPENSE
        )
        transactions = [tx for tx in transactions if tx.type == tx_type]

    category_totals: dict[str, float] = {}
    category_counts: dict[str, int] = {}

    for tx in transactions:
        cat = tx.category or "Uncategorized"
        category_totals[cat] = category_totals.get(cat, 0) + float(tx.amount)
        category_counts[cat] = category_counts.get(cat, 0) + 1

    total_amount = sum(category_totals.values())

    # Sort by amount and take top N
    return sorted(
        [
            {
                "category": cat,
                "amount": amount,
                "percentage": (amount / total_amount * 100) if total_amount > 0 else 0,
                "count": category_counts[cat],
            }
            for cat, amount in category_totals.items()
        ],
        key=lambda x: x["amount"],
        reverse=True,
    )[:limit]
