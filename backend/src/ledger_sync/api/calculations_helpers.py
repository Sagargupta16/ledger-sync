"""Stateless helpers for the calculations API endpoints.

Extracted from calculations.py to keep both modules under 500 LOC.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from ledger_sync.db.models import CategoryTrend, TransactionType

_CATEGORY_TRANSACTION_TYPES = {
    "income": TransactionType.INCOME,
    "expense": TransactionType.EXPENSE,
}


def _resolve_transaction_type(transaction_type: str | None) -> TransactionType | None:
    """Resolve an ``income``/``expense`` filter (any case) to the enum value.

    Anything else is a 422. It used to fall through to EXPENSE, so a typo or
    ``transfer`` silently answered with spending data under the wrong label.
    """
    if not transaction_type:
        return None
    resolved = _CATEGORY_TRANSACTION_TYPES.get(transaction_type.lower())
    if resolved is None:
        raise HTTPException(
            status_code=422,
            detail="transaction_type must be 'income' or 'expense'.",
        )
    return resolved


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
