"""Pair import rows with stored category fixes the way the reconciler pairs them.

The reconciler resolves public IDs after the rules run, but a fix has to land on
the row before it, so this module predicts the pairing from the same evidence:
a source UID claims its stored row first, then a content fingerprint, then the
v1 ID of a row not re-imported since fingerprints existed. Content never claims
a stored row a UID already took, and never decides for a row whose UID some
stored row carries. The once-only shape adoptions of legacy and pre-UID rows are
not predicted: ``category_overrides.restore_overwritten_fixes`` puts the fix
back on such a row after reconciliation, in the same import.
"""

from __future__ import annotations

from typing import Any, NamedTuple

import sqlalchemy as sa
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from ledger_sync.core.source_identity import has_source_uid
from ledger_sync.db._models.category_overrides import DECISION_CHANGE
from ledger_sync.db.models import TRANSACTIONS, CategoryOverride, Transaction, TransactionType

_CHUNK_SIZE = 200
_UidKey = tuple[str, str]


class Fix(NamedTuple):
    """A change override and the type its stored row has now."""

    override: CategoryOverride
    stored_type: TransactionType


class FixIndex(NamedTuple):
    by_uid: dict[_UidKey, Fix]
    by_fingerprint: dict[str, Fix]
    by_legacy_id: dict[str, Fix]


def _uid_key(row: dict[str, Any]) -> _UidKey | None:
    return (row["_source_system"], row["_source_uid"]) if has_source_uid(row) else None


def load_fixes(session: Session, user_id: int) -> FixIndex:
    """Every change override, keyed the ways an import row can name its stored row."""
    stmt = (
        select(
            CategoryOverride,
            Transaction.type,
            Transaction.source_fingerprint,
            TRANSACTIONS.c.source_system,
            TRANSACTIONS.c.source_uid,
        )
        .join(
            Transaction,
            and_(
                Transaction.user_id == CategoryOverride.user_id,
                Transaction.transaction_id == CategoryOverride.transaction_id,
            ),
        )
        .where(CategoryOverride.user_id == user_id, CategoryOverride.decision == DECISION_CHANGE)
    )
    index = FixIndex({}, {}, {})
    for override, stored_type, fingerprint, system, uid in session.execute(stmt).tuples():
        fix = Fix(override, stored_type)
        if system and uid:
            index.by_uid[(system, uid)] = fix
        if fingerprint:
            index.by_fingerprint[fingerprint] = fix
        else:
            index.by_legacy_id[override.transaction_id] = fix
    return index


def _stored_uids(session: Session, user_id: int, keys: set[_UidKey]) -> set[_UidKey]:
    """The source UIDs among ``keys`` that a stored row already carries."""
    found: set[_UidKey] = set()
    ordered = sorted(keys)
    pair = sa.tuple_(TRANSACTIONS.c.source_system, TRANSACTIONS.c.source_uid)
    for start in range(0, len(ordered), _CHUNK_SIZE):
        stmt = select(TRANSACTIONS.c.source_system, TRANSACTIONS.c.source_uid).where(
            TRANSACTIONS.c.user_id == user_id, pair.in_(ordered[start : start + _CHUNK_SIZE])
        )
        found.update((system, uid) for system, uid in session.execute(stmt).tuples())
    return found


def match_fixes(
    session: Session, user_id: int, rows: list[dict[str, Any]], index: FixIndex
) -> dict[int, Fix]:
    """The fix each row position will reach, keyed by position."""
    matched: dict[int, Fix] = {}
    claimed: set[str] = set()
    for position, row in enumerate(rows):
        key = _uid_key(row)
        fix = index.by_uid.get(key) if key else None
        if fix is not None:
            matched[position] = fix
            claimed.add(fix.override.transaction_id)
    by_content: dict[int, Fix] = {}
    for position, row in enumerate(rows):
        if position in matched:
            continue
        fix = index.by_fingerprint.get(row.get("_source_fingerprint") or "")
        fix = fix or index.by_legacy_id.get(row.get("_legacy_source_id") or "")
        if fix is not None:
            by_content[position] = fix
    keys = {key for position in by_content if (key := _uid_key(rows[position]))}
    in_use = _stored_uids(session, user_id, keys) if keys else set()
    for position, fix in by_content.items():
        key = _uid_key(rows[position])
        if (key is not None and key in in_use) or fix.override.transaction_id in claimed:
            continue
        matched[position] = fix
        claimed.add(fix.override.transaction_id)
    return matched
