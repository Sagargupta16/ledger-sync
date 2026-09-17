"""Ordered categorization rules that preserve transaction identity and annotations.

Import rules run after source fingerprints are captured. Retroactive rules only
update mutable classification fields and their normalized dimension references.
The complete write and analytics invalidation share one user-serialized commit.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.core.analytics.refresh import lock_analytics_user, mark_ledger_changed
from ledger_sync.db.models import CategorizationRule, Transaction, TransactionType
from ledger_sync.services.ledger_dimensions import sync_transactions_dimensions
from ledger_sync.utils.logging import logger


def load_active_rules(session: Session, user_id: int) -> list[CategorizationRule]:
    """Return the user's active rules in deterministic evaluation order."""
    stmt = (
        select(CategorizationRule)
        .where(
            CategorizationRule.user_id == user_id,
            CategorizationRule.is_active.is_(True),
        )
        .order_by(CategorizationRule.sort_order.asc(), CategorizationRule.id.asc())
    )
    return list(session.execute(stmt).scalars().all())


def match_rule(rule: CategorizationRule, note: str | None, account: str | None) -> bool:
    """Return True when *rule*'s pattern is a case-insensitive substring of its field."""
    needle = rule.pattern.strip().lower()
    haystack = (note if rule.match_field == "note" else account) or ""
    return needle != "" and needle in haystack.lower()


def apply_rules_to_row(rules: list[CategorizationRule], normalized_row: dict[str, Any]) -> bool:
    """Apply the first matching rule to a normalized import row, in place.

    Skips transfer rows (their category is synthesized from account names).
    On match, sets both ``category`` and ``subcategory`` (None clears it).

    Returns:
        True when a rule matched and the row was mutated.

    """
    if normalized_row.get("is_transfer"):
        return False
    note = normalized_row.get("note")
    account = normalized_row.get("account")
    for rule in rules:
        if match_rule(rule, note, account):
            normalized_row["category"] = rule.category
            normalized_row["subcategory"] = rule.subcategory
            return True
    return False


def apply_rules_retroactively(session: Session, user_id: int) -> tuple[int, int]:
    """Apply active rules atomically without changing public IDs or child rows."""
    lock_analytics_user(session, user_id)
    rules = load_active_rules(session, user_id)
    if not rules:
        session.commit()
        return (0, 0)
    rows = list(
        session.scalars(
            select(Transaction)
            .where(
                Transaction.user_id == user_id,
                Transaction.is_deleted.is_(False),
                Transaction.type != TransactionType.TRANSFER,
            )
            .execution_options(populate_existing=True)
        )
    )
    matched = 0
    changed: list[Transaction] = []
    try:
        for row in rows:
            rule = next((rule for rule in rules if match_rule(rule, row.note, row.account)), None)
            if rule is None:
                continue
            matched += 1
            if row.category == rule.category and row.subcategory == rule.subcategory:
                continue
            row.category = rule.category
            row.subcategory = rule.subcategory
            changed.append(row)
        if changed:
            sync_transactions_dimensions(session, user_id, changed)
            mark_ledger_changed(session, user_id, [row.date.date() for row in changed])
        session.commit()
    except Exception:
        session.rollback()
        raise
    logger.info(
        "Rules applied for user_id=%s: matched=%d updated=%d", user_id, matched, len(changed)
    )
    return matched, len(changed)
