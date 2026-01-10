"""Analytics API endpoints for insights and statistics."""

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ledger_sync.db.models import Transaction, TransactionType
from ledger_sync.db.session import get_session

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/overview")
def get_overview(db: Session = Depends(get_session)) -> dict[str, Any]:
    """Get overview statistics: income, expenses, net change, best/worst month."""

    # Get all non-deleted transactions
    transactions = db.query(Transaction).filter(Transaction.is_deleted.is_(False)).all()

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

    # Calculate total income and expenses
    total_income = sum(float(t.amount) for t in transactions if t.type == TransactionType.INCOME)
    total_expenses = sum(float(t.amount) for t in transactions if t.type == TransactionType.EXPENSE)

    # Calculate by month
    monthly_data: dict[str, dict[str, float]] = {}
    for t in transactions:
        month_key = t.date.strftime("%Y-%m")
        if month_key not in monthly_data:
            monthly_data[month_key] = {"income": 0, "expenses": 0}

        if t.type == TransactionType.INCOME:
            monthly_data[month_key]["income"] += float(t.amount)
        elif t.type == TransactionType.EXPENSE:
            monthly_data[month_key]["expenses"] += float(t.amount)

    # Find best and worst months
    best_month = None
    worst_month = None
    best_surplus = float("-inf")
    worst_surplus = float("inf")

    for month, data in monthly_data.items():
        surplus = data["income"] - data["expenses"]
        if surplus > best_surplus:
            best_surplus = surplus
            best_month = {
                "month": month,
                "income": data["income"],
                "expenses": data["expenses"],
                "surplus": surplus,
            }
        if surplus < worst_surplus:
            worst_surplus = surplus
            worst_month = {
                "month": month,
                "income": data["income"],
                "expenses": data["expenses"],
                "surplus": surplus,
            }

    # Account activity (total transaction volume per account)
    account_activity: dict[str, float] = {}
    for t in transactions:
        if t.account not in account_activity:
            account_activity[t.account] = 0
        account_activity[t.account] += float(t.amount)

    asset_allocation = [
        {"account": account, "balance": activity} for account, activity in account_activity.items()
    ]
    asset_allocation.sort(key=lambda x: x["balance"], reverse=True)

    return {
        "total_income": total_income,
        "total_expenses": total_expenses,
        "net_change": total_income - total_expenses,
        "best_month": best_month,
        "worst_month": worst_month,
        "asset_allocation": asset_allocation,
        "transaction_count": len(transactions),
    }


@router.get("/behavior")
def get_behavior(db: Session = Depends(get_session)) -> dict[str, Any]:
    """Get spending behavior metrics."""

    transactions = db.query(Transaction).filter(Transaction.is_deleted.is_(False)).all()

    if not transactions:
        return {
            "avg_transaction_size": 0,
            "spending_frequency": 0,
            "convenience_spending_pct": 0,
            "lifestyle_inflation": 0,
            "top_categories": [],
        }

    expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]

    if not expenses:
        return {
            "avg_transaction_size": 0,
            "spending_frequency": 0,
            "convenience_spending_pct": 0,
            "lifestyle_inflation": 0,
            "top_categories": [],
        }

    # Average transaction size
    avg_transaction_size = sum(float(t.amount) for t in expenses) / len(expenses) if expenses else 0

    # Spending frequency (transactions per month)
    dates = [t.date for t in expenses]
    if dates:
        min_date = min(dates)
        max_date = max(dates)
        months_span = (max_date.year - min_date.year) * 12 + (max_date.month - min_date.month) + 1
        spending_frequency = len(expenses) / months_span if months_span > 0 else 0
    else:
        spending_frequency = 0

    # Convenience spending (shopping, entertainment, food categories)
    convenience_categories = {
        "shopping",
        "entertainment",
        "food",
        "dining",
        "restaurant",
        "movie",
        "games",
    }
    convenience_spending = sum(
        float(t.amount) for t in expenses if t.category.lower() in convenience_categories
    )
    total_spending = sum(float(t.amount) for t in expenses)
    convenience_pct = (convenience_spending / total_spending * 100) if total_spending > 0 else 0

    # Lifestyle inflation (compare first 3 months avg vs last 3 months avg)
    sorted_expenses = sorted(expenses, key=lambda t: t.date)
    if len(sorted_expenses) >= 6:
        # First 3 months worth
        first_date = sorted_expenses[0].date
        first_3_months = [
            t
            for t in sorted_expenses
            if (t.date.year - first_date.year) * 12 + (t.date.month - first_date.month) < 3
        ]
        # Last 3 months worth
        last_date = sorted_expenses[-1].date
        last_3_months = [
            t
            for t in sorted_expenses
            if (last_date.year - t.date.year) * 12 + (last_date.month - t.date.month) < 3
        ]

        avg_first = (
            sum(float(t.amount) for t in first_3_months) / len(first_3_months)
            if first_3_months
            else 0
        )
        avg_last = (
            sum(float(t.amount) for t in last_3_months) / len(last_3_months) if last_3_months else 0
        )
        lifestyle_inflation = ((avg_last - avg_first) / avg_first * 100) if avg_first > 0 else 0
    else:
        lifestyle_inflation = 0

    # Top spending categories
    category_totals: dict[str, float] = {}
    for t in expenses:
        if t.category not in category_totals:
            category_totals[t.category] = 0
        category_totals[t.category] += float(t.amount)

    top_categories = [{"category": cat, "amount": amt} for cat, amt in category_totals.items()]
    top_categories.sort(key=lambda x: x["amount"], reverse=True)

    return {
        "avg_transaction_size": avg_transaction_size,
        "spending_frequency": spending_frequency,
        "convenience_spending_pct": convenience_pct,
        "lifestyle_inflation": lifestyle_inflation,
        "top_categories": top_categories[:10],
    }


@router.get("/trends")
def get_trends(db: Session = Depends(get_session)) -> dict[str, Any]:
    """Get spending and income trends over time."""

    transactions = db.query(Transaction).filter(Transaction.is_deleted.is_(False)).all()

    if not transactions:
        return {
            "monthly_trends": [],
            "surplus_trend": [],
            "consistency_score": 0,
        }

    # Group by month
    monthly_data: dict[str, dict[str, float]] = {}
    for t in transactions:
        month_key = t.date.strftime("%Y-%m")
        if month_key not in monthly_data:
            monthly_data[month_key] = {"income": 0, "expenses": 0}

        if t.type == TransactionType.INCOME:
            monthly_data[month_key]["income"] += float(t.amount)
        elif t.type == TransactionType.EXPENSE:
            monthly_data[month_key]["expenses"] += float(t.amount)

    # Sort by month
    sorted_months = sorted(monthly_data.keys())

    monthly_trends = [
        {
            "month": month,
            "income": monthly_data[month]["income"],
            "expenses": monthly_data[month]["expenses"],
            "surplus": monthly_data[month]["income"] - monthly_data[month]["expenses"],
        }
        for month in sorted_months
    ]

    # Surplus trend (just the surplus values for easy charting)
    surplus_trend = [
        {
            "month": trend["month"],
            "surplus": trend["surplus"],
        }
        for trend in monthly_trends
    ]

    # Consistency score (inverse of coefficient of variation of monthly expenses)
    expense_values = [monthly_data[month]["expenses"] for month in sorted_months]
    if len(expense_values) > 1:
        mean_expense = sum(expense_values) / len(expense_values)
        variance = sum((x - mean_expense) ** 2 for x in expense_values) / len(expense_values)
        std_dev = variance**0.5
        cv = (std_dev / mean_expense * 100) if mean_expense > 0 else 0
        # Convert to score: 100 = very consistent, 0 = very inconsistent
        consistency_score = max(0, 100 - cv)
    else:
        consistency_score = 100

    return {
        "monthly_trends": monthly_trends,
        "surplus_trend": surplus_trend,
        "consistency_score": consistency_score,
    }


@router.get("/wrapped")
def get_yearly_wrapped(db: Session = Depends(get_session)) -> dict[str, Any]:
    """Get yearly wrapped insights - text-based narratives."""

    transactions = db.query(Transaction).filter(Transaction.is_deleted.is_(False)).all()

    if not transactions:
        return {"insights": []}

    expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]
    income_txns = [t for t in transactions if t.type == TransactionType.INCOME]

    insights = []

    # Total spending insight
    total_spent = sum(float(t.amount) for t in expenses)
    insights.append(
        {
            "title": "Total Spending",
            "value": f"₹{total_spent:,.2f}",
            "description": f"You spent ₹{total_spent:,.2f} across {len(expenses)} transactions",
        }
    )

    # Total income insight
    total_income = sum(float(t.amount) for t in income_txns)
    insights.append(
        {
            "title": "Total Income",
            "value": f"₹{total_income:,.2f}",
            "description": f"You earned ₹{total_income:,.2f} from {len(income_txns)} sources",
        }
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
            }
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
                "description": f"You made {most_frequent[1]} transactions in {most_frequent[0]}",
            }
        )

    # Best month
    monthly_surplus: dict[str, float] = {}
    for t in transactions:
        month_key = t.date.strftime("%B %Y")
        if month_key not in monthly_surplus:
            monthly_surplus[month_key] = 0
        if t.type == TransactionType.INCOME:
            monthly_surplus[month_key] += float(t.amount)
        elif t.type == TransactionType.EXPENSE:
            monthly_surplus[month_key] -= float(t.amount)

    if monthly_surplus:
        best_month = max(monthly_surplus.items(), key=lambda x: x[1])
        insights.append(
            {
                "title": "Best Month",
                "value": best_month[0],
                "description": (
                    f"Your best month was {best_month[0]} "
                    f"with a surplus of ₹{best_month[1]:,.2f}"
                ),
            }
        )

    # Savings rate
    if total_income > 0:
        savings_rate = ((total_income - total_spent) / total_income) * 100
        insights.append(
            {
                "title": "Savings Rate",
                "value": f"{savings_rate:.1f}%",
                "description": f"You saved {savings_rate:.1f}% of your income",
            }
        )

    # Daily average spending
    if expenses:
        dates = [t.date for t in expenses]
        min_date = min(dates)
        max_date = max(dates)
        days_span = (max_date - min_date).days + 1
        daily_avg = total_spent / days_span if days_span > 0 else 0
        insights.append(
            {
                "title": "Daily Average",
                "value": f"₹{daily_avg:,.2f}",
                "description": f"You spent an average of ₹{daily_avg:,.2f} per day",
            }
        )

    return {"insights": insights}
