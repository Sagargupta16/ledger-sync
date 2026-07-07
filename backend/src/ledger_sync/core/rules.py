"""Categorization rule engine.

Rules are user-defined "field contains pattern -> set category" mappings
evaluated case-insensitively, first-match-wins, ordered by
(sort_order asc, id asc). Two application points:

* Import time (pre-hash): ``SyncEngine._reconcile_and_log`` mutates
  normalized rows BEFORE any hashing, so re-uploads stay deterministic
  (same raw row + same rules = same hash = dedup skip).
* Retroactive: ``apply_rules_retroactively`` rewrites live non-transfer
  rows AND recomputes their transaction_id (category feeds the dedup
  hash -- without the rehash, the next full-snapshot upload would
  soft-delete the retro-updated rows and re-insert duplicates). Tags
  reference transaction_id, so they are migrated in the same pass.

Transfers are always exempt: their category is synthesized from account
names and feeds transfer-leg pairing.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from ledger_sync.db.models import (
    Anomaly,
    CategorizationRule,
    Transaction,
    TransactionTag,
    TransactionType,
)
from ledger_sync.ingest.hash_id import TransactionHasher
from ledger_sync.utils.logging import logger

# Commit every N updated rows so a large retro-apply stays under the
# Neon 30s statement timeout.
_COMMIT_CHUNK = 500


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


def _rehash_with_collision_handling(
    hasher: TransactionHasher,
    row: Transaction,
    rule: CategorizationRule,
    user_id: int,
    live_ids: set[str],
) -> str:
    """Recompute the dedup hash with the rule's category/subcategory.

    Bumps occurrence until the id is unique among the user's live ids
    (including ids already assigned earlier in this pass), mirroring
    ``Reconciler.reconcile_batch`` Phase 1.
    """
    old_id = row.transaction_id
    occurrence = 0
    while True:
        new_id = hasher.generate_transaction_id(
            date=row.date,
            amount=row.amount,
            account=row.account,
            note=row.note,
            category=rule.category,
            subcategory=rule.subcategory,
            tx_type=row.type.value,
            user_id=user_id,
            occurrence=occurrence,
        )
        if new_id == old_id or new_id not in live_ids:
            return new_id
        occurrence += 1


def _move_transaction_id(
    session: Session,
    row: Transaction,
    rule: CategorizationRule,
    user_id: int,
    new_id: str,
) -> None:
    """Rewrite *row*'s PK to *new_id*, carrying its tags and anomalies along.

    A direct UPDATE of the child FK column would violate the constraint on
    Postgres in either order (the new parent id doesn't exist yet / the old
    one still has children), so: collect -> delete -> flush the parent PK
    change -> re-insert against the new id. Anomalies (nullable FK) are
    detached before the PK moves and re-pointed after.
    """
    old_id = row.transaction_id
    tag_values = [
        tag_row[0]
        for tag_row in session.execute(
            select(TransactionTag.tag).where(
                TransactionTag.user_id == user_id,
                TransactionTag.transaction_id == old_id,
            )
        ).all()
    ]
    if tag_values:
        session.execute(
            delete(TransactionTag).where(
                TransactionTag.user_id == user_id,
                TransactionTag.transaction_id == old_id,
            )
        )
    anomaly_ids = [
        anomaly_row[0]
        for anomaly_row in session.execute(
            select(Anomaly.id).where(
                Anomaly.user_id == user_id,
                Anomaly.transaction_id == old_id,
            )
        ).all()
    ]
    if anomaly_ids:
        session.execute(
            update(Anomaly).where(Anomaly.id.in_(anomaly_ids)).values(transaction_id=None)
        )
    row.transaction_id = new_id
    row.category = rule.category
    row.subcategory = rule.subcategory
    session.flush()
    for tag in tag_values:
        session.add(TransactionTag(user_id=user_id, transaction_id=new_id, tag=tag))
    if anomaly_ids:
        session.execute(
            update(Anomaly).where(Anomaly.id.in_(anomaly_ids)).values(transaction_id=new_id)
        )


def apply_rules_retroactively(session: Session, user_id: int) -> tuple[int, int]:
    """Apply all active rules to the user's live non-transfer transactions.

    For each rewritten row the transaction_id is recomputed with the new
    category/subcategory (occurrence-collision handling mirrors
    ``Reconciler.reconcile_batch`` Phase 1) and any transaction_tags rows
    are migrated to the new id. Commits every ``_COMMIT_CHUNK`` updated
    rows and once at the end.

    Returns:
        Tuple of (matched, updated): matched counts rows where some rule
        matched; updated is the subset actually rewritten (rows already
        at the target category+subcategory are skipped).

    """
    rules = load_active_rules(session, user_id)
    if not rules:
        return (0, 0)

    hasher = TransactionHasher()

    stmt = select(Transaction).where(
        Transaction.user_id == user_id,
        Transaction.is_deleted.is_(False),
        Transaction.type != TransactionType.TRANSFER,
    )
    rows = list(session.execute(stmt).scalars().all())

    # Live ids of this user -- used for collision detection when rehashing.
    # Updated as we go so ids assigned earlier in this batch also collide.
    live_ids: set[str] = {row.transaction_id for row in rows}

    matched = 0
    updated = 0
    pending_since_commit = 0

    for row in rows:
        rule = next((r for r in rules if match_rule(r, row.note, row.account)), None)
        if rule is None:
            continue
        matched += 1

        if row.category == rule.category and row.subcategory == rule.subcategory:
            continue

        old_id = row.transaction_id
        new_id = _rehash_with_collision_handling(hasher, row, rule, user_id, live_ids)

        if new_id != old_id:
            _move_transaction_id(session, row, rule, user_id, new_id)
            live_ids.discard(old_id)
            live_ids.add(new_id)
        else:
            row.category = rule.category
            row.subcategory = rule.subcategory
        updated += 1
        pending_since_commit += 1

        if pending_since_commit >= _COMMIT_CHUNK:
            session.commit()
            pending_since_commit = 0

    session.commit()
    logger.info(
        "Retroactive rule apply for user_id=%s: matched=%d updated=%d",
        user_id,
        matched,
        updated,
    )
    return (matched, updated)
