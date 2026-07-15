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

# Commit every N moved rows to bound transaction size and lock /
# idle-in-transaction exposure on Postgres (the Neon statement timeout is
# per-statement, so chunking is about transaction lifetime, not statements).
_COMMIT_CHUNK = 500

# IN() lookups are chunked to avoid SQL parameter limits, mirroring
# ``Reconciler._batch_fetch_existing``.
_IN_CHUNK = 500


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
    ids: set[str],
) -> str:
    """Recompute the dedup hash with the rule's category/subcategory.

    Bumps occurrence until the id is unique among ALL of the user's
    transaction ids -- soft-deleted rows still occupy their PK, so they
    must collide too (including ids already assigned earlier in this
    pass), mirroring ``Reconciler.reconcile_batch`` Phase 1.
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
        if new_id == old_id or new_id not in ids:
            return new_id
        occurrence += 1


def _prefetch_children(
    session: Session,
    user_id: int,
    old_ids: list[str],
) -> tuple[dict[str, list[str]], dict[str, list[int]]]:
    """Batch-fetch tags and anomaly ids for the rows about to move.

    Two IN() queries per ``_IN_CHUNK`` ids instead of two SELECTs per row,
    mirroring ``Reconciler._batch_fetch_existing``.

    Returns:
        Tuple of (tags_by_id, anomaly_ids_by_id) keyed by old transaction_id.

    """
    tags_by_id: dict[str, list[str]] = {}
    anomaly_ids_by_id: dict[str, list[int]] = {}
    for i in range(0, len(old_ids), _IN_CHUNK):
        chunk = old_ids[i : i + _IN_CHUNK]
        tag_rows = session.execute(
            select(TransactionTag.transaction_id, TransactionTag.tag).where(
                TransactionTag.user_id == user_id,
                TransactionTag.transaction_id.in_(chunk),
            )
        ).all()
        for tag_tx_id, tag in tag_rows:
            tags_by_id.setdefault(tag_tx_id, []).append(tag)
        anomaly_rows = session.execute(
            select(Anomaly.transaction_id, Anomaly.id).where(
                Anomaly.user_id == user_id,
                Anomaly.transaction_id.in_(chunk),
            )
        ).all()
        for anomaly_tx_id, anomaly_id in anomaly_rows:
            if anomaly_tx_id is not None:
                anomaly_ids_by_id.setdefault(anomaly_tx_id, []).append(anomaly_id)
    return tags_by_id, anomaly_ids_by_id


def _move_transaction_id(
    session: Session,
    row: Transaction,
    rule: CategorizationRule,
    user_id: int,
    new_id: str,
    tag_values: list[str],
    anomaly_ids: list[int],
) -> None:
    """Rewrite *row*'s PK to *new_id*, carrying its tags and anomalies along.

    A direct UPDATE of the child FK column would violate the constraint on
    Postgres in either order (the new parent id doesn't exist yet / the old
    one still has children), so: delete -> flush the parent PK change ->
    re-insert against the new id. Anomalies (nullable FK) are detached
    before the PK moves and re-pointed after. ``tag_values`` and
    ``anomaly_ids`` are the row's children prefetched by
    ``_prefetch_children`` so bulk applies avoid per-row SELECTs.
    """
    old_id = row.transaction_id
    if tag_values:
        session.execute(
            delete(TransactionTag).where(
                TransactionTag.user_id == user_id,
                TransactionTag.transaction_id == old_id,
            )
        )
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


def _collect_moves(
    rows: list[Transaction],
    rules: list[CategorizationRule],
    hasher: TransactionHasher,
    user_id: int,
    ids: set[str],
) -> tuple[int, int, list[tuple[Transaction, CategorizationRule, str]]]:
    """Phase A: match rules and rehash in memory, without touching the DB.

    Rows whose recomputed id is unchanged (theoretically unreachable, since
    category feeds the hash) are updated in place here; rows that need a PK
    move are collected for the batched phases. ``ids`` is maintained as
    moves are collected so ids assigned earlier in the pass also collide.

    Returns:
        Tuple of (matched, updated_in_place, moves) where each move is
        (row, rule, new_id).

    """
    matched = 0
    updated_in_place = 0
    moves: list[tuple[Transaction, CategorizationRule, str]] = []
    for row in rows:
        rule = next((r for r in rules if match_rule(r, row.note, row.account)), None)
        if rule is None:
            continue
        matched += 1

        if row.category == rule.category and row.subcategory == rule.subcategory:
            continue

        old_id = row.transaction_id
        new_id = _rehash_with_collision_handling(hasher, row, rule, user_id, ids)
        if new_id == old_id:
            row.category = rule.category
            row.subcategory = rule.subcategory
            updated_in_place += 1
        else:
            ids.discard(old_id)
            ids.add(new_id)
            moves.append((row, rule, new_id))
    return matched, updated_in_place, moves


def apply_rules_retroactively(session: Session, user_id: int) -> tuple[int, int]:
    """Apply all active rules to the user's live non-transfer transactions.

    Three batched phases: (A) match + rehash in memory -- occurrence
    collisions are checked against the user's FULL transaction id keyspace,
    since soft-deleted rows still occupy their PK (mirroring
    ``Reconciler.reconcile_batch`` Phase 1); (B) one IN()-chunked prefetch
    of the moving rows' tags and anomalies; (C) the PK moves, committing
    every ``_COMMIT_CHUNK`` moved rows and once at the end.

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

    # ALL of this user's transaction ids -- soft-deleted rows still occupy
    # their PK, so rehashing onto one would raise an IntegrityError if only
    # live ids were considered.
    ids: set[str] = set(
        session.execute(
            select(Transaction.transaction_id).where(Transaction.user_id == user_id)
        ).scalars()
    )

    matched, updated_in_place, moves = _collect_moves(rows, rules, hasher, user_id, ids)
    tags_by_id, anomaly_ids_by_id = _prefetch_children(
        session, user_id, [row.transaction_id for row, _, _ in moves]
    )

    # Chunked commits bound transaction size / lock lifetime on Postgres.
    # expire_on_commit is disabled for the pass so those commits don't
    # expire every loaded row (each attribute access after an expiring
    # commit would otherwise refresh via its own SELECT).
    prior_expire_on_commit = session.expire_on_commit
    session.expire_on_commit = False
    try:
        pending_since_commit = 0
        for row, rule, new_id in moves:
            old_id = row.transaction_id
            _move_transaction_id(
                session,
                row,
                rule,
                user_id,
                new_id,
                tags_by_id.get(old_id, []),
                anomaly_ids_by_id.get(old_id, []),
            )
            pending_since_commit += 1
            if pending_since_commit >= _COMMIT_CHUNK:
                session.commit()
                pending_since_commit = 0
        session.commit()
    finally:
        session.expire_on_commit = prior_expire_on_commit

    updated = updated_in_place + len(moves)
    logger.info(
        "Retroactive rule apply for user_id=%s: matched=%d updated=%d",
        user_id,
        matched,
        updated,
    )
    return (matched, updated)
