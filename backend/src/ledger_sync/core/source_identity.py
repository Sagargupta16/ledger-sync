"""Stable identity for rows from a source that has its own IDs (a Money Manager backup).

Spreadsheet rows are identified by their content, so editing a note in the
source used to retire the stored row and insert a new one. A backup row carries
the source's UID instead: the stored row with that UID is claimed first and is
updated in place, whatever changed. Rows imported before UIDs existed are
adopted once, when their economic shape is unique on both sides.

Editing content changes a row's content fingerprint while its public ID stays,
so this module also clears fingerprints a batch hands to another row and picks
a fresh public ID for a new row whose fingerprint an older row already uses.
"""

from __future__ import annotations

import hashlib
from collections import defaultdict
from typing import Any

from sqlalchemy import bindparam, select, update
from sqlalchemy.orm import Session

from ledger_sync.db.models import TRANSACTIONS, Transaction
from ledger_sync.ingest.hash_id import TransactionHasher

# Keys a source with stable IDs adds to its upload rows, and the columns they fill.
SOURCE_FIELDS = {
    "_source_system": "source_system",
    "_source_uid": "source_uid",
    "_source_updated_at": "source_updated_at",
    "_occurred_at": "occurred_at",
}

_CHUNK_SIZE = 200
_HASHER = TransactionHasher()
_LooseShape = tuple[str, ...]


def has_source_uid(row: dict[str, Any]) -> bool:
    return bool(row.get("_source_uid") and row.get("_source_system"))


def match_source_uids(
    session: Session,
    user_id: int,
    rows: list[dict[str, Any]],
    fingerprints: list[str],
    matches: dict[str, Transaction],
    claimed: set[str],
) -> None:
    """Claim the stored row carrying each row's source UID, soft-deleted rows included."""
    keyed = {
        (row["_source_system"], row["_source_uid"]): fingerprint
        for row, fingerprint in zip(rows, fingerprints, strict=True)
        if has_source_uid(row)
    }
    by_system: dict[str, list[str]] = defaultdict(list)
    for system, uid in keyed.keys():
        by_system[system].append(uid)
    for system, uids in by_system.items():
        for start in range(0, len(uids), _CHUNK_SIZE):
            stmt = select(Transaction, TRANSACTIONS.c.source_uid).where(
                Transaction.user_id == user_id,
                TRANSACTIONS.c.source_system == system,
                TRANSACTIONS.c.source_uid.in_(uids[start : start + _CHUNK_SIZE]),
            )
            for transaction, uid in session.execute(stmt).tuples():
                fingerprint = keyed[(system, uid or "")]
                matches[fingerprint] = transaction
                claimed.add(transaction.transaction_id)


def _loose_shape(values: dict[str, Any]) -> _LooseShape:
    """The economic shape without the note and labels a source lets users edit."""
    return (
        values["date"].replace(tzinfo=None).isoformat(),
        *(
            _HASHER.normalize_for_hash(values.get(field))
            for field in ("amount", "account", "type", "from_account", "to_account")
        ),
    )


def adopt_edited_source_rows(
    session: Session,
    user_id: int,
    rows: list[dict[str, Any]],
    fingerprints: list[str],
    matches: dict[str, Transaction],
    claimed: set[str],
) -> None:
    """Let a row with a source UID claim the live stored row it was before an edit.

    Only stored rows without a source UID are candidates, and only a shape that
    occurs once among the unmatched source rows and once among those stored
    rows is paired. Anything less certain falls through to a new row.
    """
    pending: dict[_LooseShape, list[str]] = defaultdict(list)
    for row, fingerprint in zip(rows, fingerprints, strict=True):
        if has_source_uid(row) and fingerprint not in matches:
            pending[_loose_shape(row)].append(fingerprint)
    if not pending:
        return
    stored: dict[_LooseShape, list[Transaction]] = defaultdict(list)
    for transaction in session.scalars(
        select(Transaction).where(
            Transaction.user_id == user_id,
            TRANSACTIONS.c.source_uid.is_(None),
            Transaction.is_deleted.is_(False),
        )
    ):
        if transaction.transaction_id in claimed:
            continue
        values = {
            field: getattr(transaction, field)
            for field in ("date", "amount", "account", "type", "from_account", "to_account")
        }
        stored[_loose_shape(values)].append(transaction)
    for shape, group in pending.items():
        candidates = stored.get(shape, [])
        if len(group) == 1 and len(candidates) == 1:
            matches[group[0]] = candidates[0]
            claimed.add(candidates[0].transaction_id)


def source_values(row: dict[str, Any]) -> dict[str, Any] | None:
    """The source identity and timestamps a row carries, by column, if it has any."""
    values = {column: row[key] for key, column in SOURCE_FIELDS.items() if key in row}
    return values or None


def write_source_values(
    session: Session, user_id: int, pending: list[tuple[str, dict[str, Any]]]
) -> None:
    """Store source values on flushed rows in one Core UPDATE per column set.

    The columns are table-only for the expand phase, so the ORM cannot write them.
    """
    by_columns: dict[tuple[str, ...], list[dict[str, Any]]] = defaultdict(list)
    for transaction_id, values in pending:
        binds = {f"v_{column}": value for column, value in values.items()}
        by_columns[tuple(sorted(values))].append({"v_id": transaction_id, **binds})
    for columns, params in by_columns.items():
        stmt = (
            update(TRANSACTIONS)
            .where(
                TRANSACTIONS.c.user_id == user_id,
                TRANSACTIONS.c.transaction_id == bindparam("v_id"),
            )
            .values({column: bindparam(f"v_{column}") for column in columns})
        )
        session.execute(stmt.execution_options(synchronize_session=False), params)


def release_reassigned_fingerprints(
    session: Session,
    user_id: int,
    fingerprints: list[str],
    matches: dict[str, Transaction],
) -> None:
    """Clear each fingerprint this batch assigns to a different row than holds it now.

    A source edit gives a stored row new content, and so a new fingerprint,
    while another row may still hold that fingerprint. Clearing first and
    flushing keeps the per-user unique index valid while rows are reassigned.
    A cleared row that this batch does not match is retired by the sweep.
    """
    keepers = {
        transaction.transaction_id
        for fingerprint, transaction in matches.items()
        if transaction.source_fingerprint == fingerprint
    }
    released = False
    for start in range(0, len(fingerprints), _CHUNK_SIZE):
        stmt = select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.source_fingerprint.in_(fingerprints[start : start + _CHUNK_SIZE]),
        )
        for holder in session.scalars(stmt):
            if holder.transaction_id not in keepers:
                holder.source_fingerprint = None
                released = True
    for fingerprint, transaction in matches.items():
        if transaction.source_fingerprint not in (None, fingerprint):
            transaction.source_fingerprint = None
            released = True
    if released:
        session.flush()


def unused_transaction_ids(
    session: Session, user_id: int, fingerprints: list[str]
) -> dict[str, str]:
    """Public IDs for new rows: the fingerprint, unless an older row already uses it.

    A row whose content a source edit changed keeps its original public ID, so
    a later row with that original content needs another one. The fallback is
    derived from the fingerprint, so a retry of the same batch picks it again.
    """
    taken: set[str] = set()
    for start in range(0, len(fingerprints), _CHUNK_SIZE):
        stmt = select(Transaction.transaction_id).where(
            Transaction.user_id == user_id,
            Transaction.transaction_id.in_(fingerprints[start : start + _CHUNK_SIZE]),
        )
        taken.update(session.scalars(stmt))
    chosen: dict[str, str] = {}
    for fingerprint in fingerprints:
        candidate, attempt = fingerprint, 0
        while candidate in taken:
            attempt += 1
            candidate = hashlib.sha256(f"{fingerprint}:{attempt}".encode()).hexdigest()
            if session.get(Transaction, candidate) is not None:
                taken.add(candidate)
        taken.add(candidate)
        chosen[fingerprint] = candidate
    return chosen
