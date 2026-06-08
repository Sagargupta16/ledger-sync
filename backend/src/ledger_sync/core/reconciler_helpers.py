"""Stateless helpers for transaction reconciliation.

Extracted from `Reconciler` to keep that class under the 500-LOC ceiling.
None of these need access to `self`.
"""

from __future__ import annotations

from typing import Any

from ledger_sync.utils.logging import logger


class ReconciliationStats:
    """Statistics from reconciliation process."""

    def __init__(self) -> None:
        """Initialize stats."""
        self.processed = 0
        self.inserted = 0
        self.updated = 0
        self.deleted = 0
        self.skipped = 0

    def __repr__(self) -> str:
        """Return string representation."""
        return (
            f"ReconciliationStats(processed={self.processed}, "
            f"inserted={self.inserted}, updated={self.updated}, "
            f"deleted={self.deleted}, skipped={self.skipped})"
        )

    def merge(self, other: ReconciliationStats) -> None:
        """Accumulate another batch's counters into this one."""
        self.processed += other.processed
        self.inserted += other.inserted
        self.updated += other.updated
        self.deleted += other.deleted
        self.skipped += other.skipped


def normalize_enum_value(value: Any) -> str | None:
    """Extract a comparable string from an enum or raw value."""
    if hasattr(value, "value"):
        return str(value.value)
    if value:
        return str(value)
    return None


def are_enum_values_equal(new_value: Any, old_value: Any) -> bool:
    """Compare two enum-like values case-insensitively."""
    new_str = normalize_enum_value(new_value)
    old_str = normalize_enum_value(old_value)
    new_upper = new_str.upper() if new_str else None
    old_upper = old_str.upper() if old_str else None
    return new_upper == old_upper


def are_string_values_equal(new_value: Any, old_value: Any) -> bool:
    """Compare two string values, treating None and empty string as equal."""
    new_normalized = new_value if new_value else None
    old_normalized = old_value if old_value else None
    return new_normalized == old_normalized


def update_stats_for_action(stats: ReconciliationStats, action: str) -> None:
    """Increment the appropriate counter based on the reconciliation action."""
    if action == "inserted":
        stats.inserted += 1
    elif action == "updated":
        stats.updated += 1
    elif action == "skipped":
        stats.skipped += 1


def log_batch_duplicate(row: dict[str, Any], record_id: str, *, is_transfer: bool) -> None:
    """Log a warning about a duplicate record found within a batch."""
    if is_transfer:
        logger.warning(
            f"Skipping duplicate transfer in batch: {record_id[:16]}... "
            f"(Date: {row['date']}, Amount: {row['amount']}, "
            f"From: {row['from_account']}, To: {row['to_account']})",
        )
    else:
        logger.warning(
            f"Skipping duplicate transaction in batch: {record_id[:16]}... "
            f"(Date: {row['date']}, Amount: {row['amount']}, "
            f"Account: {row['account']}, Category: {row['category']}, "
            f"Type: {row['type']})",
        )
