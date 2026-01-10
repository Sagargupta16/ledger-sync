"""Calculation API endpoints - All financial calculations."""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ledger_sync.db.models import Transaction, TransactionType
from ledger_sync.db.session import get_session

router = APIRouter(prefix="/api/calculations", tags=["calculations"])


def get_transactions(
    db: Session, start_date: datetime | None = None, end_date: datetime | None = None
) -> list[Transaction]:
    """Get non-deleted transactions, optionally filtered by date range."""
    query = db.query(Transaction).filter(Transaction.is_deleted.is_(False))

    if start_date:
        query = query.filter(Transaction.date >= start_date)
    if end_date:
        query = query.filter(Transaction.date <= end_date)

    return query.all()


@router.get("/totals")
def get_totals(
    db: Session = Depends(get_session),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
) -> dict[str, Any]:
    """Calculate total income, expenses, and net savings."""

    transactions = get_transactions(db, start_date, end_date)

    total_income = sum(float(tx.amount) for tx in transactions if tx.type == TransactionType.INCOME)
    total_expenses = sum(
        float(tx.amount) for tx in transactions if tx.type == TransactionType.EXPENSE
    )
    net_savings = total_income - total_expenses
    savings_rate = (net_savings / total_income * 100) if total_income > 0 else 0

    return {
        "total_income": total_income,
        "total_expenses": total_expenses,
        "net_savings": net_savings,
        "savings_rate": savings_rate,
        "transaction_count": len(transactions),
    }


@router.get("/monthly-aggregation")
def get_monthly_aggregation(
    db: Session = Depends(get_session),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
) -> dict[str, Any]:
    """Calculate monthly income and expense aggregation."""

    transactions = get_transactions(db, start_date, end_date)

    monthly_data: dict[str, dict[str, float]] = {}

    for tx in transactions:
        month_key = tx.date.strftime("%Y-%m")

        if month_key not in monthly_data:
            monthly_data[month_key] = {
                "income": 0,
                "expense": 0,
                "net_savings": 0,
                "transactions": 0,
            }

        if tx.type == TransactionType.INCOME:
            monthly_data[month_key]["income"] += float(tx.amount)
        elif tx.type == TransactionType.EXPENSE:
            monthly_data[month_key]["expense"] += float(tx.amount)

        monthly_data[month_key]["transactions"] += 1

    # Calculate net savings for each month
    for month_key in monthly_data:
        monthly_data[month_key]["net_savings"] = (
            monthly_data[month_key]["income"] - monthly_data[month_key]["expense"]
        )

    return monthly_data


@router.get("/yearly-aggregation")
def get_yearly_aggregation(
    db: Session = Depends(get_session),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
) -> dict[str, Any]:
    """Calculate yearly income and expense aggregation."""

    transactions = get_transactions(db, start_date, end_date)

    yearly_data: dict[str, dict[str, Any]] = {}

    for tx in transactions:
        year = str(tx.date.year)
        month = tx.date.month

        if year not in yearly_data:
            yearly_data[year] = {
                "income": 0,
                "expense": 0,
                "net_savings": 0,
                "transactions": 0,
                "months": set(),
            }

        if tx.type == TransactionType.INCOME:
            yearly_data[year]["income"] += float(tx.amount)
        elif tx.type == TransactionType.EXPENSE:
            yearly_data[year]["expense"] += float(tx.amount)

        yearly_data[year]["transactions"] += 1
        yearly_data[year]["months"].add(month)

    # Calculate net savings and convert months set to list
    for year in yearly_data:
        yearly_data[year]["net_savings"] = (
            yearly_data[year]["income"] - yearly_data[year]["expense"]
        )
        yearly_data[year]["months"] = sorted(list(yearly_data[year]["months"]))

    return yearly_data


@router.get("/category-breakdown")
def get_category_breakdown(
    db: Session = Depends(get_session),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    transaction_type: str | None = Query(None, description="Filter by type: Income or Expense"),
) -> dict[str, Any]:
    """Calculate spending/income breakdown by category and subcategory."""

    transactions = get_transactions(db, start_date, end_date)

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

        category_data[category]["total"] += float(tx.amount)
        category_data[category]["count"] += 1

        if subcategory not in category_data[category]["subcategories"]:
            category_data[category]["subcategories"][subcategory] = 0

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


@router.get("/account-balances")
def get_account_balances(
    db: Session = Depends(get_session),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
) -> dict[str, Any]:
    """Calculate current balance for each account."""

    transactions = get_transactions(db, start_date, end_date)

    account_balances: dict[str, dict[str, Any]] = {}

    for tx in transactions:
        account = tx.account or "Unknown"

        if account not in account_balances:
            account_balances[account] = {
                "balance": 0,
                "transactions": 0,
                "last_transaction": None,
            }

        if tx.type == TransactionType.INCOME:
            account_balances[account]["balance"] += float(tx.amount)
        elif tx.type == TransactionType.EXPENSE:
            account_balances[account]["balance"] -= float(tx.amount)

        account_balances[account]["transactions"] += 1

        # Update last transaction date
        if (
            account_balances[account]["last_transaction"] is None
            or tx.date > account_balances[account]["last_transaction"]
        ):
            account_balances[account]["last_transaction"] = tx.date.isoformat()

    # Calculate statistics
    total_balance = sum(acc["balance"] for acc in account_balances.values())
    total_accounts = len(account_balances)
    average_balance = total_balance / total_accounts if total_accounts > 0 else 0
    positive_accounts = sum(1 for acc in account_balances.values() if acc["balance"] > 0)
    negative_accounts = sum(1 for acc in account_balances.values() if acc["balance"] < 0)

    return {
        "accounts": account_balances,
        "statistics": {
            "total_accounts": total_accounts,
            "total_balance": total_balance,
            "average_balance": average_balance,
            "positive_accounts": positive_accounts,
            "negative_accounts": negative_accounts,
        },
    }


@router.get("/insights")
def get_financial_insights(
    db: Session = Depends(get_session),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
) -> dict[str, Any]:
    """Calculate comprehensive financial insights."""

    transactions = get_transactions(db, start_date, end_date)

    expenses = [tx for tx in transactions if tx.type == TransactionType.EXPENSE]
    income = [tx for tx in transactions if tx.type == TransactionType.INCOME]

    total_income = sum(float(tx.amount) for tx in income)
    total_expenses = sum(float(tx.amount) for tx in expenses)

    # Category analysis
    category_totals: dict[str, float] = {}
    category_counts: dict[str, int] = {}

    for tx in expenses:
        cat = tx.category or "Uncategorized"
        category_totals[cat] = category_totals.get(cat, 0) + float(tx.amount)
        category_counts[cat] = category_counts.get(cat, 0) + 1

    # Top expense category
    top_category = max(category_totals.items(), key=lambda x: x[1]) if category_totals else ("", 0)

    # Most frequent category
    most_frequent = max(category_counts.items(), key=lambda x: x[1]) if category_counts else ("", 0)

    # Calculate averages
    day_count = (end_date - start_date).days if start_date and end_date else 30
    month_count = day_count / 30

    average_daily_expense = total_expenses / day_count if day_count > 0 else 0
    average_monthly_expense = total_expenses / month_count if month_count > 0 else 0

    # Savings rate
    savings_rate = ((total_income - total_expenses) / total_income * 100) if total_income > 0 else 0

    # Largest transaction
    largest = max(expenses, key=lambda tx: float(tx.amount)) if expenses else None

    # Unusual spending (transactions > 2x category average)
    unusual_spending = []
    for category, total in category_totals.items():
        count = category_counts[category]
        avg_amount = total / count

        for tx in [t for t in expenses if (t.category or "Uncategorized") == category]:
            if float(tx.amount) > avg_amount * 2:
                unusual_spending.append(
                    {
                        "category": category,
                        "amount": float(tx.amount),
                        "average_amount": avg_amount,
                        "deviation": ((float(tx.amount) - avg_amount) / avg_amount * 100),
                        "date": tx.date.isoformat(),
                    }
                )

    return {
        "top_expense_category": {
            "category": top_category[0],
            "amount": top_category[1],
            "percentage": (top_category[1] / total_expenses * 100) if total_expenses > 0 else 0,
        },
        "most_frequent_category": {
            "category": most_frequent[0],
            "count": most_frequent[1],
        },
        "average_daily_expense": average_daily_expense,
        "average_monthly_expense": average_monthly_expense,
        "savings_rate": savings_rate,
        "largest_transaction": (
            {
                "amount": float(largest.amount) if largest else 0,
                "category": largest.category if largest else "",
                "date": largest.date.isoformat() if largest else None,
            }
            if largest
            else None
        ),
        "unusual_spending": unusual_spending[:5],  # Top 5
        "total_income": total_income,
        "total_expenses": total_expenses,
    }


@router.get("/daily-net-worth")
def get_daily_net_worth(
    db: Session = Depends(get_session),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
) -> dict[str, Any]:
    """Calculate daily income and expense data for net worth trends."""

    transactions = get_transactions(db, start_date, end_date)

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
            }
        )

    return {
        "daily_data": daily_data,
        "cumulative_data": cumulative_data,
    }


@router.get("/top-categories")
def get_top_categories(
    db: Session = Depends(get_session),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    limit: int = Query(10, ge=1, le=50),
    transaction_type: str | None = Query(None, description="Filter by type: Income or Expense"),
) -> list[dict[str, Any]]:
    """Get top N categories by amount."""

    transactions = get_transactions(db, start_date, end_date)

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
    top_categories = sorted(
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

    return top_categories
