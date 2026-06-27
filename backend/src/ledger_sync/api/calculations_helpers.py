"""Stateless helpers for the calculations API endpoints.

Extracted from calculations.py to keep both modules under 500 LOC.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ledger_sync.core.query_helpers import build_transaction_query
from ledger_sync.db.models import CategoryTrend, Transaction, TransactionType, User


def _compute_income_analysis(
    transactions: list[Transaction],
    cashback_classification: list[str],
) -> dict[str, Any]:
    """Income page stats: total, by-category, monthly trend (+3mo avg), cashback.

    Mirrors IncomeAnalysisPage's client math. ``cashback_classification`` is the
    user's ``non_taxable_income_categories`` list (``"Category::Subcategory"``
    entries), passed from the client so the backend doesn't duplicate the
    preference source -- matched case-insensitively, exactly like
    ``matchesClassification``.
    """
    income = [t for t in transactions if t.type == TransactionType.INCOME]

    total_income = sum(abs(float(t.amount)) for t in income)

    by_category: dict[str, float] = defaultdict(float)
    for t in income:
        by_category[t.category or "Other Income"] += abs(float(t.amount))

    # Monthly trend with a trailing 3-month rolling average.
    by_month: dict[str, float] = defaultdict(float)
    for t in income:
        by_month[t.date.strftime("%Y-%m")] += abs(float(t.amount))
    sorted_months = sorted(by_month.items())
    monthly_data: list[dict[str, Any]] = []
    for i, (month, amount) in enumerate(sorted_months):
        window = sorted_months[max(0, i - 2) : i + 1]
        avg = sum(a for _, a in window) / len(window)
        monthly_data.append({"month": month, "income": amount, "income_avg_3m": avg})

    # Cashback = income rows whose Category::Subcategory is in the user's
    # non-taxable list (case-insensitive exact match).
    wanted = {c.lower() for c in cashback_classification}
    cashbacks_total = sum(
        abs(float(t.amount))
        for t in income
        if f"{t.category or ''}::{t.subcategory or ''}".lower() in wanted
    )

    incomes = [m["income"] for m in monthly_data]
    peak_income = max(incomes) if incomes else 0.0
    non_zero = [m["income"] for m in monthly_data if m["income"] > 0]
    growth_rate = (
        ((non_zero[-1] - non_zero[0]) / non_zero[0] * 100)
        if len(non_zero) >= 2 and non_zero[0]
        else 0.0
    )

    return {
        "total_income": total_income,
        "category_breakdown": dict(by_category),
        "monthly_data": monthly_data,
        "cashbacks_total": cashbacks_total,
        "peak_income": peak_income,
        "growth_rate": growth_rate,
    }


def _compute_category_monthly_history(
    transactions: list[Transaction],
    tx_type: TransactionType,
    month_keys: list[str],
) -> dict[str, list[float]]:
    """Per-category spend over the given trailing month keys (oldest first).

    Mirrors the client's ``buildMonthlyHistoryByCategory``: for each category,
    a list aligned to ``month_keys`` where each slot is the absolute sum of
    that category's transactions of ``tx_type`` in that YYYY-MM (0 if none).
    The month keys are supplied by the caller (the client's "trailing 12
    calendar months from today" window) so the buckets line up exactly.
    """
    month_index = {k: i for i, k in enumerate(month_keys)}
    n = len(month_keys)
    buckets: dict[str, list[float]] = {}
    for txn in transactions:
        if txn.type != tx_type or not txn.category:
            continue
        key = txn.date.strftime("%Y-%m")
        idx = month_index.get(key)
        if idx is None:
            continue
        series = buckets.setdefault(txn.category, [0.0] * n)
        series[idx] += abs(float(txn.amount))
    return buckets


def _median(sorted_values: list[float]) -> float:
    """Median of a pre-sorted list (matches the client's computeMedian)."""
    n = len(sorted_values)
    if n == 0:
        return 0.0
    mid = n // 2
    if n % 2 == 0:
        return (sorted_values[mid - 1] + sorted_values[mid]) / 2
    return sorted_values[mid]


def _compute_quick_insights(transactions: list[Transaction]) -> dict[str, Any]:
    """Compute the raw-transaction-derived Quick Insights stats.

    Mirrors the client-side math in ``quickInsightsData.ts`` exactly so the
    Dashboard band renders identical numbers without shipping the full ledger:

    - net cashback: Income rows whose subcategory contains "cashback" minus
      Transfers whose to_account contains "cashback shared" (substring, not an
      exact hardcoded category -- the source of the prior ``₹0`` bug).
    - median / biggest / avg expense, weekend split, peak weekday, total
      transfers, top income source, most expensive month.

    Weekday uses the stored naive date (Python ``weekday()``: Mon=0..Sun=6),
    remapped to JS ``getDay()`` (Sun=0) so the client labels line up -- and the
    bucketing is timezone-stable because it never round-trips through a TZ.
    """
    expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]
    income = [t for t in transactions if t.type == TransactionType.INCOME]
    transfers = [t for t in transactions if t.type == TransactionType.TRANSFER]

    expense_amounts = sorted(abs(float(t.amount)) for t in expenses)
    total_spending = sum(expense_amounts)

    # Net cashback (substring match, parity with computeNetCashback).
    cashback_txs = [t for t in income if "cashback" in (t.subcategory or "").lower()]
    total_cashback = sum(abs(float(t.amount)) for t in cashback_txs)
    total_shared = sum(
        abs(float(t.amount)) for t in transfers if "cashback shared" in (t.to_account or "").lower()
    )

    # Weekend vs weekday + peak weekday (JS getDay convention: Sun=0..Sat=6).
    py_to_js = {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0}
    by_weekday: dict[int, float] = dict.fromkeys(range(7), 0.0)
    for t in expenses:
        by_weekday[py_to_js[t.date.weekday()]] += abs(float(t.amount))
    weekend_spending = by_weekday[0] + by_weekday[6]
    peak_js_day = max(by_weekday, key=lambda d: by_weekday[d]) if expenses else 0

    # Top income source (by category) + most expensive month (by expense).
    income_by_cat: dict[str, float] = defaultdict(float)
    for t in income:
        income_by_cat[t.category or "Other"] += abs(float(t.amount))
    top_income = max(income_by_cat.items(), key=lambda kv: kv[1]) if income_by_cat else None

    expense_by_month: dict[str, float] = defaultdict(float)
    for t in expenses:
        expense_by_month[t.date.strftime("%Y-%m")] += abs(float(t.amount))
    top_month = max(expense_by_month.items(), key=lambda kv: kv[1]) if expense_by_month else None

    biggest = max(expenses, key=lambda t: abs(float(t.amount))) if expenses else None

    # Actual data span (min/max date) so the client can compute days/months in
    # range without holding the raw rows. ISO date strings; null when empty.
    all_dates = [t.date for t in transactions]
    min_date = min(all_dates).date().isoformat() if all_dates else None
    max_date = max(all_dates).date().isoformat() if all_dates else None

    return {
        "min_date": min_date,
        "max_date": max_date,
        "net_cashback": total_cashback - total_shared,
        "cashback_count": len(cashback_txs),
        "median_expense": _median(expense_amounts),
        "biggest_expense": {
            "amount": abs(float(biggest.amount)) if biggest else 0.0,
            "category": (biggest.category or "") if biggest else "",
        },
        "avg_expense": (total_spending / len(expenses)) if expenses else 0.0,
        "total_spending": total_spending,
        "expense_count": len(expenses),
        "weekend_spending": weekend_spending,
        "weekday_spending": total_spending - weekend_spending,
        "peak_day": peak_js_day,
        "peak_day_total": by_weekday[peak_js_day],
        "total_transfers": sum(abs(float(t.amount)) for t in transfers),
        "transfer_count": len(transfers),
        "top_income_source": (
            {"category": top_income[0], "amount": top_income[1]} if top_income else None
        ),
        "most_expensive_month": (
            {"period": top_month[0], "amount": top_month[1]} if top_month else None
        ),
    }


def _format_largest_transaction(largest: Transaction | None) -> dict[str, Any] | None:
    """Format largest transaction data."""
    if not largest:
        return None
    return {
        "amount": float(largest.amount),
        "category": largest.category or "",
        "date": largest.date.isoformat(),
    }


def _resolve_transaction_type(transaction_type: str | None) -> TransactionType | None:
    """Resolve a string transaction type filter to the enum value."""
    if not transaction_type:
        return None
    if transaction_type.lower() == "income":
        return TransactionType.INCOME
    return TransactionType.EXPENSE


def _build_category_data_from_trends(
    trends: list[CategoryTrend],
) -> dict[str, Any]:
    """Build category breakdown response from pre-computed CategoryTrend rows."""
    category_data: dict[str, dict[str, Any]] = {}
    for t in trends:
        cat = t.category or "Uncategorized"
        subcat = t.subcategory or "Other"
        amount = float(t.total_amount)

        if cat not in category_data:
            category_data[cat] = {"total": 0.0, "count": 0, "subcategories": {}}

        category_data[cat]["total"] += amount
        category_data[cat]["count"] += t.transaction_count
        category_data[cat]["subcategories"][subcat] = (
            category_data[cat]["subcategories"].get(subcat, 0.0) + amount
        )

    return _finalize_category_percentages(category_data)


def _build_category_data_from_rows(
    rows: list[Any],
) -> dict[str, Any]:
    """Build category breakdown response from raw SQL aggregation rows."""
    category_data: dict[str, dict[str, Any]] = {}
    for row in rows:
        cat = row.category
        subcat = row.subcategory
        amount = float(row.total)

        if cat not in category_data:
            category_data[cat] = {"total": 0.0, "count": 0, "subcategories": {}}

        category_data[cat]["total"] += amount
        category_data[cat]["count"] += row.count
        category_data[cat]["subcategories"][subcat] = amount

    return _finalize_category_percentages(category_data)


def _finalize_category_percentages(
    category_data: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Add percentage fields and return final response dict."""
    total_amount = sum(c["total"] for c in category_data.values())
    for cat_info in category_data.values():
        cat_info["percentage"] = (cat_info["total"] / total_amount * 100) if total_amount > 0 else 0
    return {"categories": category_data, "total": total_amount}


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
    # Pre-group by category once (O(n)) instead of scanning all expenses per category (O(c*n))
    by_category: dict[str, list[Transaction]] = defaultdict(list)
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
    return unusual[:5]


def _calculate_expense_averages(
    total_expenses: float,
    start_date: datetime | None,
    end_date: datetime | None,
) -> tuple[float, float]:
    """Return (average_daily_expense, average_monthly_expense)."""
    day_count = max((end_date - start_date).days, 1) if start_date and end_date else 30
    month_count = max(day_count / 30.44, 1)  # 365.25/12 avg days per month
    average_daily = total_expenses / day_count
    average_monthly = total_expenses / month_count if month_count > 0 else 0
    return average_daily, average_monthly


def get_transactions(
    db: Session,
    user: User,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> list[Transaction]:
    """Get non-deleted transactions for a user, optionally filtered by date range."""
    return list(build_transaction_query(db, user, start_date, end_date).all())
