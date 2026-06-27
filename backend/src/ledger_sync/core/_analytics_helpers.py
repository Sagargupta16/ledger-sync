"""Module-level helpers and constants for AnalyticsEngine.

Extracted from analytics_engine.py to keep the main file focused on the
AnalyticsEngine class. These are pure functions with no reliance on the
engine's state -- they take the engine's lookup callables as parameters.
"""

from __future__ import annotations

import re
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

# Empty by default -- users configure their own mappings via
# Settings -> Account Classifications (stored in UserPreferences.
# investment_account_mappings). Shipping a populated default would
# leak the maintainer's personal account names into every install.
DEFAULT_INVESTMENT_ACCOUNT_PATTERNS: dict[str, str] = {}


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

    Mode-first: the most frequently observed day is the intended one. This is
    correct for the common cases a blanket "max>=25 -> max" rule got wrong --
    e.g. a day-1 bill with a few late-month outliers ([1 x many, 30, 31]) should
    be 1, not 31; a salary clustered on the 27th should be 27, not a stray 31.

    The late-month-clamp case is preserved: when the MODE itself is a late-month
    day (>= 28), short months clamp the true day downward (a 31st bill posts as
    28/30), so we return the max of the late cluster to recover the real intent.
    Ties in frequency break toward the day nearest the median (robust to drift).
    """
    if not days:
        return None

    from collections import Counter

    counts = Counter(days)
    top_freq = max(counts.values())
    modes = [d for d, c in counts.items() if c == top_freq]

    sorted_days = sorted(days)
    mid = len(sorted_days) // 2
    median = sorted_days[mid] if len(sorted_days) % 2 == 1 else sorted_days[mid - 1]

    # Break frequency ties toward the day closest to the median.
    mode = min(modes, key=lambda d: (abs(d - median), d))

    # Late-month bill: the dominant day clamps in short months, so recover the
    # intended (latest) day from the late cluster rather than reporting a clamped
    # value. Only triggers when the mode itself is late (>= 28), so a day-1 bill
    # with sparse end-of-month noise is unaffected.
    if mode >= 28:
        return max(days)
    return mode


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


def mom_change_pct(current: Decimal, previous: Decimal | None) -> float:
    """Return month-over-month percentage change, or 0 when previous is falsy."""
    if previous and previous > 0:
        return float((current - previous) / previous * 100)
    return 0.0


def monthly_type_totals(
    transactions: list[Transaction],
) -> dict[str, dict[str, Decimal]]:
    """Aggregate transaction amounts by YYYY-MM period and transaction type."""
    totals: dict[str, dict[str, Decimal]] = defaultdict(
        lambda: {"Income": Decimal(0), "Expense": Decimal(0)},
    )
    for txn in transactions:
        period_key = txn.date.strftime("%Y-%m")
        totals[period_key][txn.type.value] += Decimal(str(txn.amount))
    return totals


# Precompile once so normalize_note() isn't paying regex-compile cost per call.
_MONTH_TRAILER = re.compile(
    r" (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?: \d{1,4})?$",
)
_DATE_TRAILER = re.compile(r" \d{1,2}[/\-]\d{2,4}$")
_NUMBER_TRAILER = re.compile(r" #?\d+$")


def normalize_note(note: str | None) -> str | None:
    """Normalize a transaction note for grouping.

    Strips whitespace, lowercases, and removes trailing date-like tokens so
    notes like "Rent Jan 2026" and "Rent Feb 2026" collapse to the same key.
    """
    if not note or not note.strip():
        return None
    text = " ".join(note.split()).lower()
    text = _MONTH_TRAILER.sub("", text)
    text = _DATE_TRAILER.sub("", text)
    text = _NUMBER_TRAILER.sub("", text)
    return text.strip() or None


def compute_account_balances(
    transactions: list[Transaction],
) -> dict[str, Decimal]:
    """Derive a net balance per account by walking the transaction history."""
    balances: dict[str, Decimal] = defaultdict(Decimal)
    for txn in transactions:
        if txn.type == TransactionType.TRANSFER:
            if txn.from_account:
                balances[txn.from_account] -= Decimal(str(txn.amount))
            if txn.to_account:
                balances[txn.to_account] += Decimal(str(txn.amount))
        elif txn.type == TransactionType.INCOME:
            balances[txn.account] += Decimal(str(txn.amount))
        elif txn.type == TransactionType.EXPENSE:
            balances[txn.account] -= Decimal(str(txn.amount))
    return balances
