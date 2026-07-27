"""The shared shape of one insight, plus the expense filter every generator uses.

Its own module so the two generator files depend on one definition of the
insight dict instead of each carrying a copy.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from ledger_sync.db.models import TransactionType

if TYPE_CHECKING:
    from ledger_sync.db.models import Transaction

Insight = dict[str, str]


def build_insight(title: str, description: str, severity: str) -> Insight:
    """Build one insight. *severity* must be from ``INSIGHT_SEVERITIES``."""
    return {"title": title, "description": description, "severity": severity}


def expenses_of(transactions: list[Transaction]) -> list[Transaction]:
    """Only the EXPENSE rows -- income and transfers distort every spend metric."""
    return [t for t in transactions if t.type == TransactionType.EXPENSE]
