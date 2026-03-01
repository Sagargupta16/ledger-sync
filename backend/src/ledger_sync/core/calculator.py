"""Centralized calculation service for financial metrics and insights.

All calculations are pure module-level functions that take transaction data
and return computed metrics.

Uses Decimal for all financial arithmetic to avoid floating-point precision loss.
"""

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal
from statistics import mean, pstdev
from typing import Any

from ledger_sync.db.models import Transaction, TransactionType


def _to_decimal(amount: Any) -> Decimal:
    """Safely convert a transaction amount to Decimal."""
    if isinstance(amount, Decimal):
        return amount
    return Decimal(str(amount))


def calculate_totals(transactions: list[Transaction]) -> dict[str, float]:
    """Calculate total income and expenses."""
    total_income = sum(
        (_to_decimal(t.amount) for t in transactions if t.type == TransactionType.INCOME),
        Decimal(0),
    )
    total_expenses = sum(
        (_to_decimal(t.amount) for t in transactions if t.type == TransactionType.EXPENSE),
        Decimal(0),
    )
    return {
        "total_income": float(total_income),
        "total_expenses": float(total_expenses),
        "net_change": float(total_income - total_expenses),
    }


def calculate_savings_rate(total_income: float, total_expenses: float) -> float:
    """Calculate savings rate as percentage (0-100)."""
    if total_income == 0:
        return 0.0
    return ((total_income - total_expenses) / total_income) * 100


def calculate_daily_spending_rate(transactions: list[Transaction]) -> float:
    """Calculate average daily spending."""
    expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]
    if not expenses:
        return 0.0

    dates = [t.date for t in expenses]
    days_span = (max(dates) - min(dates)).days + 1

    total_spent = sum((_to_decimal(t.amount) for t in expenses), Decimal(0))
    return float(total_spent / days_span) if days_span > 0 else 0.0


def calculate_monthly_burn_rate(transactions: list[Transaction]) -> float:
    """Calculate average monthly spending."""
    expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]
    if not expenses:
        return 0.0

    dates = [t.date for t in expenses]
    min_date, max_date = min(dates), max(dates)
    months_span = max(
        (max_date.year - min_date.year) * 12 + (max_date.month - min_date.month) + 1, 1
    )

    total_spent = sum((_to_decimal(t.amount) for t in expenses), Decimal(0))
    return float(total_spent / months_span) if months_span > 0 else 0.0


def group_by_month(transactions: list[Transaction]) -> dict[str, dict[str, float]]:
    """Group transactions by month with income/expense breakdown."""
    monthly_data: dict[str, dict[str, Decimal]] = defaultdict(
        lambda: {"income": Decimal(0), "expenses": Decimal(0)},
    )
    for t in transactions:
        month_key = t.date.strftime("%Y-%m")
        if t.type == TransactionType.INCOME:
            monthly_data[month_key]["income"] += _to_decimal(t.amount)
        elif t.type == TransactionType.EXPENSE:
            monthly_data[month_key]["expenses"] += _to_decimal(t.amount)

    return {
        k: {"income": float(v["income"]), "expenses": float(v["expenses"])}
        for k, v in monthly_data.items()
    }


def group_by_category(transactions: list[Transaction]) -> dict[str, float]:
    """Group expense transactions by category."""
    category_totals: dict[str, Decimal] = defaultdict(Decimal)
    for t in transactions:
        if t.type == TransactionType.EXPENSE:
            category_totals[t.category] += _to_decimal(t.amount)
    return {k: float(v) for k, v in category_totals.items()}


def group_by_account(transactions: list[Transaction]) -> dict[str, float]:
    """Group transactions by account and calculate net balance."""
    account_totals: dict[str, Decimal] = defaultdict(Decimal)
    for t in transactions:
        amount = _to_decimal(t.amount)
        if t.type == TransactionType.INCOME:
            account_totals[t.account] += amount
        elif t.type == TransactionType.EXPENSE:
            account_totals[t.account] -= amount
        elif t.type == TransactionType.TRANSFER:
            if t.from_account:
                account_totals[t.from_account] -= amount
            if t.to_account:
                account_totals[t.to_account] += amount
    return {k: float(v) for k, v in account_totals.items()}


def calculate_consistency_score(monthly_expenses: list[float]) -> float:
    """Calculate spending consistency score (0-100). Higher = more consistent."""
    if len(monthly_expenses) <= 1:
        return 100.0
    avg = mean(monthly_expenses)
    if avg == 0:
        return 100.0
    cv = (pstdev(monthly_expenses) / avg) * 100
    return max(0.0, 100.0 - cv)


def calculate_lifestyle_inflation(transactions: list[Transaction]) -> float:
    """Calculate lifestyle inflation: first 3 months vs last 3 months spending."""
    expenses = sorted(
        (t for t in transactions if t.type == TransactionType.EXPENSE),
        key=lambda t: t.date,
    )
    if len(expenses) < 6:
        return 0.0

    first_date = expenses[0].date
    first_3_months = [
        t for t in expenses
        if (t.date.year - first_date.year) * 12 + (t.date.month - first_date.month) < 3
    ]

    last_date = expenses[-1].date
    last_3_months = [
        t for t in expenses
        if (last_date.year - t.date.year) * 12 + (last_date.month - t.date.month) < 3
    ]

    if not first_3_months or not last_3_months:
        return 0.0

    avg_first = float(sum((_to_decimal(t.amount) for t in first_3_months), Decimal(0)) / 3)
    avg_last = float(sum((_to_decimal(t.amount) for t in last_3_months), Decimal(0)) / 3)

    if avg_first == 0:
        return 0.0
    return ((avg_last - avg_first) / avg_first) * 100


def calculate_category_concentration(category_totals: dict[str, float]) -> float:
    """Calculate top category concentration percentage."""
    if not category_totals:
        return 0.0
    total = sum(category_totals.values())
    if total == 0:
        return 0.0
    return (max(category_totals.values()) / total) * 100


def calculate_spending_velocity(
    transactions: list[Transaction],
    recent_days: int = 30,
) -> dict[str, float]:
    """Calculate spending velocity: recent vs historical daily spending."""
    expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]
    if not expenses:
        return {"recent_daily": 0.0, "historical_daily": 0.0, "velocity_ratio": 0.0}

    today = max(t.date for t in expenses)
    recent_cutoff = today - timedelta(days=recent_days)

    recent_expenses = [t for t in expenses if t.date >= recent_cutoff]
    historical_expenses = [t for t in expenses if t.date < recent_cutoff]

    recent_total = sum((_to_decimal(t.amount) for t in recent_expenses), Decimal(0))
    recent_daily = float(recent_total / recent_days) if recent_days > 0 else 0.0

    historical_daily = 0.0
    if historical_expenses:
        hist_dates = [t.date for t in historical_expenses]
        hist_days = (max(hist_dates) - min(hist_dates)).days + 1
        hist_total = sum((_to_decimal(t.amount) for t in historical_expenses), Decimal(0))
        historical_daily = float(hist_total / hist_days) if hist_days > 0 else 0.0

    velocity_ratio = (recent_daily / historical_daily) if historical_daily > 0 else 0.0
    return {
        "recent_daily": recent_daily,
        "historical_daily": historical_daily,
        "velocity_ratio": velocity_ratio,
    }


def find_best_worst_months(monthly_data: dict[str, dict[str, float]]) -> dict[str, Any]:
    """Find best and worst months by surplus."""
    if not monthly_data:
        return {"best_month": None, "worst_month": None}

    def _to_entry(month: str, data: dict[str, float]) -> dict[str, Any]:
        return {"month": month, "income": data["income"], "expenses": data["expenses"],
                "surplus": data["income"] - data["expenses"]}

    entries = [_to_entry(m, d) for m, d in monthly_data.items()]
    return {
        "best_month": max(entries, key=lambda e: e["surplus"]),
        "worst_month": min(entries, key=lambda e: e["surplus"]),
    }


def calculate_convenience_spending(transactions: list[Transaction]) -> dict[str, float]:
    """Calculate convenience spending metrics."""
    expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]

    convenience_categories = {
        "shopping", "entertainment", "food", "dining", "restaurant", "movie", "games",
    }

    convenience_spending = sum(
        (_to_decimal(t.amount) for t in expenses
         if t.category and t.category.lower() in convenience_categories),
        Decimal(0),
    )
    total_spending = sum((_to_decimal(t.amount) for t in expenses), Decimal(0))

    convenience_pct = (
        float(convenience_spending / total_spending * 100) if total_spending > 0 else 0.0
    )
    return {
        "convenience_amount": float(convenience_spending),
        "total_amount": float(total_spending),
        "convenience_pct": convenience_pct,
    }
