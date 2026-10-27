"""Semantic transaction search: what to embed, what is stale, and the ranking.

The embedded text is "note | category | subcategory | account" for the rows the
Transactions page lists (the user's own, not soft-deleted, excluded accounts
left out). Amounts and dates never leave the database. A row needs embedding
when it has no vector or the hash of its text changed since it was embedded.

Ranking is an exact nearest-neighbour scan restricted to one user: pgvector's
cosine distance on PostgreSQL, numpy cosine on SQLite. Callers pass the
already-filtered Transaction query, so the page filters still narrow the rows.
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

import numpy as np
from numpy.typing import NDArray
from pgvector.sqlalchemy import Vector
from sqlalchemy import Float, and_, bindparam, cast, delete, func, select
from sqlalchemy.orm import Query, Session, defer

from ledger_sync.core.embeddings import TITAN_V2_MODEL_ID
from ledger_sync.core.query_helpers import ledger_criteria
from ledger_sync.db._models.transaction_embeddings import (
    EMBEDDING_DIMENSIONS,
    TransactionEmbedding,
)
from ledger_sync.db.models import Transaction

#: Longer notes are cut; the other three fields are at most 255 characters each.
NOTE_CHARS = 1_000

_EMBEDDING_JOIN = and_(
    TransactionEmbedding.user_id == Transaction.user_id,
    TransactionEmbedding.transaction_id == Transaction.transaction_id,
)


@dataclass(frozen=True, slots=True)
class PendingRow:
    transaction_id: str
    text: str
    text_hash: str


@dataclass(frozen=True, slots=True)
class IndexState:
    total: int
    indexed: int
    #: Newest first, so the rows people search for most are embedded first.
    pending: list[PendingRow]


def embedding_text(
    note: str | None, category: str | None, subcategory: str | None, account: str | None
) -> str:
    """'note | category | subcategory | account' with blank parts left out."""
    fields = ((note or "")[:NOTE_CHARS], category, subcategory, account)
    parts = (" ".join((value or "").split()) for value in fields)
    return " | ".join(part for part in parts if part)


def text_hash(text: str) -> str:
    """Changes with the text, the model or the dimensions, so any of them re-embeds."""
    return hashlib.sha256(f"{TITAN_V2_MODEL_ID}:{EMBEDDING_DIMENSIONS}:{text}".encode()).hexdigest()


def index_state(session: Session, user_id: int, excluded: set[str]) -> IndexState:
    """Coverage of the user's live rows, and the rows still to embed."""
    rows = session.execute(
        select(
            Transaction.transaction_id,
            Transaction.note,
            Transaction.category,
            Transaction.subcategory,
            Transaction.account,
            TransactionEmbedding.text_hash,
        )
        .outerjoin(TransactionEmbedding, _EMBEDDING_JOIN)
        .where(*ledger_criteria(user_id, excluded))
        .order_by(Transaction.date.desc(), Transaction.transaction_id)
    ).all()
    total = indexed = 0
    pending: list[PendingRow] = []
    for transaction_id, note, category, subcategory, account, stored_hash in rows:
        text = embedding_text(note, category, subcategory, account)
        if not text:
            continue
        total += 1
        digest = text_hash(text)
        if stored_hash == digest:
            indexed += 1
        else:
            pending.append(PendingRow(transaction_id, text, digest))
    return IndexState(total=total, indexed=indexed, pending=pending)


def indexed_count(session: Session, user_id: int, excluded: set[str]) -> int:
    """Live rows that have a vector from the current model."""
    return int(
        session.scalar(
            select(func.count())
            .select_from(Transaction)
            .join(TransactionEmbedding, _EMBEDDING_JOIN)
            .where(*ledger_criteria(user_id, excluded))
            .where(TransactionEmbedding.model == TITAN_V2_MODEL_ID)
        )
        or 0
    )


def _present_ids(session: Session, user_id: int, ids: list[str]) -> set[str]:
    """Which of *ids* still exist (a row can be hard-deleted while its batch is at Bedrock)."""
    return set(
        session.scalars(
            select(Transaction.transaction_id).where(
                Transaction.user_id == user_id, Transaction.transaction_id.in_(ids)
            )
        )
    )


def _vector_rows(session: Session, user_id: int, ids: list[str]) -> dict[str, TransactionEmbedding]:
    """The vector rows already stored for *ids*, without their old vectors."""
    rows = session.scalars(
        select(TransactionEmbedding)
        # The old vector is replaced, never read: do not fetch it.
        .options(defer(TransactionEmbedding.embedding))
        .where(
            TransactionEmbedding.user_id == user_id,
            TransactionEmbedding.transaction_id.in_(ids),
        )
    )
    return {item.transaction_id: item for item in rows}


def _upsert(
    session: Session,
    user_id: int,
    row: PendingRow,
    vector: NDArray[np.float32],
    item: TransactionEmbedding | None,
) -> None:
    if item is None:
        session.add(
            TransactionEmbedding(
                user_id=user_id,
                transaction_id=row.transaction_id,
                model=TITAN_V2_MODEL_ID,
                text_hash=row.text_hash,
                embedding=vector,
            )
        )
        return
    item.model = TITAN_V2_MODEL_ID
    item.text_hash = row.text_hash
    item.embedding = vector
    item.embedded_at = datetime.now(UTC)


def store_embeddings(
    session: Session,
    user_id: int,
    rows: Sequence[tuple[PendingRow, NDArray[np.float32]]],
) -> int:
    """Insert or replace vectors for rows that still exist; flushes, never commits.

    The caller holds the per-user usage lock, so two tabs indexing at once
    cannot both insert the same transaction.
    """
    if not rows:
        return 0
    ids = [row.transaction_id for row, _ in rows]
    present = _present_ids(session, user_id, ids)
    existing = _vector_rows(session, user_id, ids)
    stored = 0
    for row, vector in rows:
        if row.transaction_id in present:
            _upsert(session, user_id, row, vector, existing.get(row.transaction_id))
            stored += 1
    session.flush()
    return stored


def delete_index(session: Session, user_id: int) -> int:
    """Remove every vector the user has; flushes, never commits."""
    result = session.execute(
        delete(TransactionEmbedding).where(TransactionEmbedding.user_id == user_id)
    )
    return int(getattr(result, "rowcount", 0) or 0)


def _cosine(matrix: NDArray[np.float32], vector: NDArray[np.float32]) -> NDArray[np.float32]:
    norms = np.linalg.norm(matrix, axis=1) * np.linalg.norm(vector)
    dots = matrix @ vector
    scores: NDArray[np.float32] = np.divide(dots, norms, out=np.zeros_like(dots), where=norms > 0)
    return scores


def nearest(
    query: Query[Transaction], vector: NDArray[np.float32], *, limit: int
) -> list[tuple[Transaction, float]]:
    """The rows *query* selects, ranked by cosine similarity to *vector*, best first."""
    query = query.join(TransactionEmbedding, _EMBEDDING_JOIN).filter(
        TransactionEmbedding.model == TITAN_V2_MODEL_ID
    )
    if query.session.get_bind().dialect.name == "postgresql":
        target = cast(
            bindparam("query_vector", vector.tolist(), type_=Vector(EMBEDDING_DIMENSIONS)),
            Vector(EMBEDDING_DIMENSIONS),
        )
        distance = TransactionEmbedding.embedding.op("<=>", return_type=Float)(target)
        ranked = (
            query.add_columns(distance.label("distance"))
            .order_by(distance, Transaction.transaction_id)
            .limit(limit)
            .all()
        )
        return [(tx, 1.0 - float(dist)) for tx, dist in ranked]

    pairs = query.with_entities(Transaction.transaction_id, TransactionEmbedding.embedding).all()
    if not pairs:
        return []
    scores = _cosine(np.stack([embedding for _, embedding in pairs]), vector)
    order = sorted(range(len(pairs)), key=lambda i: (-float(scores[i]), pairs[i][0]))[:limit]
    top = {pairs[i][0]: float(scores[i]) for i in order}
    rows = {tx.transaction_id: tx for tx in query.filter(Transaction.transaction_id.in_(list(top)))}
    return [(rows[tid], score) for tid, score in top.items() if tid in rows]
