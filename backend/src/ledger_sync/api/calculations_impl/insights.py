"""``/api/calculations/insights`` from five projected columns, not ORM rows.

The endpoint used to hydrate every transaction in the window as a full ORM
object (twenty-odd columns plus an identity-map entry each) to read five of
them. It now selects exactly ``type, category, subcategory, amount, date``
from the same filtered query, in the same order, and runs the same Python
arithmetic over them, so every figure is unchanged float for float.

Classified realised capital losses (``capital_loss_categories``) are NOT
spending, matching ``/totals`` and ``/category-breakdown``: they leave the
expense total, the category ranking, the averages, the largest-transaction
pick and the unusual-spending scan. They are still netted from
``savings_rate``, because the cash really left -- the same rate ``/totals``
publishes. With nothing classified the response is byte-for-byte the old one.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from typing import Any, NamedTuple

from sqlalchemy.orm import Session

from ledger_sync.core.expense_class import is_capital_loss
from ledger_sync.core.query_helpers import build_transaction_query, capital_loss_keys_for
from ledger_sync.db.models import Transaction, TransactionType, User


class ExpenseRow(NamedTuple):
    """The three fields every expense statistic below reads."""

    category: str
    amount: Decimal
    date: datetime


def _build_category_analysis(
    expenses: list[ExpenseRow],
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
    expenses: list[ExpenseRow],
    category_totals: dict[str, float],
    category_counts: dict[str, int],
) -> list[dict[str, Any]]:
    """Identify transactions exceeding 2x their category average, returning top 5."""
    # Pre-group by category once (O(n)) instead of scanning all expenses per category (O(c*n))
    by_category: dict[str, list[ExpenseRow]] = defaultdict(list)
    for tx in expenses:
        by_category[tx.category or "Uncategorized"].append(tx)

    unusual: list[dict[str, Any]] = []
    for category, total in category_totals.items():
        avg_amount = total / category_counts[category]
        threshold = avg_amount * 2

        for tx in by_category.get(category, []):
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
    # Stable sort: equal deviations keep their discovery order.
    unusual.sort(key=lambda item: item["deviation"], reverse=True)
    return unusual[:5]


def _calculate_expense_averages(
    total_expenses: float,
    start_date: datetime | None,
    end_date: datetime | None,
    transaction_dates: list[datetime],
) -> tuple[float, float]:
    """Return (average_daily_expense, average_monthly_expense).

    A missing bound falls back to the first/last transaction date in the
    window, so an unfiltered call averages over the real data span instead of
    a fixed 30 days. Days are inclusive: Jan 1 to Jan 31 is 31 days.
    """
    first = start_date or (min(transaction_dates) if transaction_dates else None)
    last = end_date or (max(transaction_dates) if transaction_dates else None)
    day_count = max((last.date() - first.date()).days + 1, 1) if first and last else 1
    month_count = max(day_count / 30.44, 1)  # 365.25/12 avg days per month
    average_daily = total_expenses / day_count
    average_monthly = total_expenses / month_count if month_count > 0 else 0
    return average_daily, average_monthly


def _format_largest_transaction(largest: ExpenseRow | None) -> dict[str, Any] | None:
    """Format largest transaction data."""
    if not largest:
        return None
    return {
        "amount": float(largest.amount),
        "category": largest.category or "",
        "date": largest.date.isoformat(),
    }


def financial_insights(
    db: Session, user: User, start_date: datetime | None, end_date: datetime | None
) -> dict[str, Any]:
    """Expense statistics for the window; see the module docstring for the rules."""
    loss_keys = capital_loss_keys_for(user)
    rows = (
        build_transaction_query(db, user, start_date, end_date)
        .with_entities(
            Transaction.type,
            Transaction.category,
            Transaction.subcategory,
            Transaction.amount,
            Transaction.date,
        )
        .all()
    )

    expenses: list[ExpenseRow] = []
    income_amounts: list[Decimal] = []
    loss_amounts: list[Decimal] = []
    for tx_type, category, subcategory, amount, date in rows:
        if tx_type == TransactionType.INCOME:
            income_amounts.append(amount)
        elif tx_type == TransactionType.EXPENSE:
            if is_capital_loss(category, subcategory, loss_keys):
                loss_amounts.append(amount)
            else:
                expenses.append(ExpenseRow(category, amount, date))

    total_income = sum(float(amount) for amount in income_amounts)
    total_expenses = sum(float(tx.amount) for tx in expenses)
    capital_losses = sum(float(amount) for amount in loss_amounts)

    category_totals, category_counts = _build_category_analysis(expenses)

    top_category = max(category_totals.items(), key=lambda x: x[1]) if category_totals else ("", 0)
    most_frequent = max(category_counts.items(), key=lambda x: x[1]) if category_counts else ("", 0)

    average_daily_expense, average_monthly_expense = _calculate_expense_averages(
        total_expenses, start_date, end_date, [row.date for row in rows]
    )
    net_savings = total_income - total_expenses - capital_losses
    savings_rate = (net_savings / total_income * 100) if total_income > 0 else 0
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
