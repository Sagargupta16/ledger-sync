"""Module-level helpers and constants for AnalyticsEngine.

Extracted from analytics_engine.py to keep the main file focused on the
AnalyticsEngine class. These are pure functions with no reliance on the
engine's state -- they take the engine's lookup callables as parameters.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from datetime import datetime
from decimal import Decimal
from typing import Any

from ledger_sync.db.models import RecurrenceFrequency, Transaction, TransactionType

# Default values (used if no preferences in DB)
DEFAULT_ESSENTIAL_CATEGORIES = {
    "Housing",
    "Healthcare",
    "Transportation",
    "Food & Dining",
    "Education",
    "Family",
    "Utilities",
}

DEFAULT_INVESTMENT_ACCOUNT_PATTERNS = {
    "Grow Stocks": "stocks",
    "Grow Mutual Funds": "mutual_funds",
    "IND money": "stocks",
    "FD/Bonds": "fixed_deposits",
    "EPF": "ppf_epf",
    "PPF": "ppf_epf",
    "RSUs": "stocks",
}


def group_txns_by_pattern(
    transactions: list[Transaction],
    normalize_fn: Callable[[str | None], str | None],
) -> dict[tuple[str, str], list[Transaction]]:
    """Group transactions by (normalized note/category, type) tuple."""
    patterns: dict[tuple[str, str], list[Transaction]] = defaultdict(list)
    for txn in transactions:
        label = normalize_fn(txn.note)
        if not label:
            label = txn.category.lower()
            if txn.subcategory:
                label = f"{txn.category.lower()} - {txn.subcategory.lower()}"
        key = (label, txn.type.value)
        patterns[key].append(txn)
    return patterns


def resolve_pattern_display(
    txns: list[Transaction],
    dates: list[datetime],
    avg_amount: float,
    amount_variance: float,
    frequency: RecurrenceFrequency,
    confidence: float,
    expected_day: int | None,
    txn_type: str,
) -> dict[str, Any]:
    """Build a recurring-pattern record from matched transactions."""
    most_recent = max(txns, key=lambda t: t.date)
    pattern_name = most_recent.note or most_recent.category
    if not most_recent.note and most_recent.subcategory:
        pattern_name = f"{most_recent.category} - {most_recent.subcategory}"

    return {
        "pattern_name": pattern_name,
        "category": most_recent.category,
        "subcategory": most_recent.subcategory,
        "account": most_recent.account,
        "txn_type": txn_type,
        "frequency": frequency,
        "expected_amount": Decimal(str(avg_amount)),
        "amount_variance": Decimal(str(amount_variance)),
        "expected_day": expected_day,
        "confidence": confidence,
        "occurrences": len(txns),
        "last_occurrence": max(dates),
    }


def infer_expected_day_of_month(days: list[int]) -> int | None:
    """Infer the intended billing day from observed day-of-month values.

    For a subscription set to the 31st, short months clamp it to 28/30, producing
    values like [31, 28, 31, 30, 31]. A plain mode can pick the wrong "canonical"
    day. Heuristic:

    - If any observation is >= 25, assume a late-month bill and return the max
      (the "intended" day before short-month clamping).
    - Otherwise return the median (robust to occasional 1-day drifts like
      weekend settlement lag).
    """
    if not days:
        return None
    if max(days) >= 25:
        return max(days)
    sorted_days = sorted(days)
    mid = len(sorted_days) // 2
    if len(sorted_days) % 2 == 1:
        return sorted_days[mid]
    # For even count, pick the lower median (integers, no averaging)
    return sorted_days[mid - 1]


def aggregate_holdings_data(
    transactions: list[Transaction],
    is_investment_account: Callable[[str | None], bool],
) -> dict[str, dict[str, Any]]:
    """Aggregate invested/income/expense Decimals per investment account."""
    holdings_data: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"invested": Decimal(0), "income": Decimal(0), "expense": Decimal(0)},
    )
    for txn in transactions:
        if txn.type == TransactionType.TRANSFER:
            if txn.to_account and is_investment_account(txn.to_account):
                holdings_data[txn.to_account]["invested"] += Decimal(str(txn.amount))
            if txn.from_account and is_investment_account(txn.from_account):
                holdings_data[txn.from_account]["invested"] -= Decimal(str(txn.amount))
        elif txn.type == TransactionType.INCOME and is_investment_account(txn.account):
            holdings_data[txn.account]["income"] += Decimal(str(txn.amount))
        elif txn.type == TransactionType.EXPENSE and is_investment_account(txn.account):
            holdings_data[txn.account]["expense"] += Decimal(str(txn.amount))
    return holdings_data
