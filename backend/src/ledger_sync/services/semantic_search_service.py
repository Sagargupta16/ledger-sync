"""Semantic transaction search flows: index status, one indexing batch, the query vector.

The router owns HTTP (limits, filters, response rows). This module owns the
order of operations around Bedrock: commit a usage reservation, call the
provider with no transaction open, settle what was billed and commit, then
store the vectors in a second transaction -- so a failed store can never undo
the settlement and leave a reservation counting against the user's budgets.
Only note, category, subcategory and account text is sent, never amounts or dates.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from numpy.typing import NDArray
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ledger_sync.config.embedding_settings import embedding_settings
from ledger_sync.core.embeddings import (
    TITAN_V2_MODEL_ID,
    BedrockRuntime,
    Embedded,
    EmbedFailure,
    EmbedOutcome,
    embed_many,
    embed_one,
    estimate_tokens,
    usd_cost,
)
from ledger_sync.core.semantic_search import (
    IndexState,
    PendingRow,
    delete_index,
    index_state,
    store_embeddings,
)
from ledger_sync.db._models.transaction_embeddings import EMBEDDING_DIMENSIONS
from ledger_sync.schemas.semantic_search import (
    SemanticIndexBatch,
    SemanticIndexDeleted,
    SemanticSearchStatus,
)
from ledger_sync.services.semantic_search_access import (
    EmbeddingAccess,
    app_tokens_today,
    embedding_access,
    lock_user_usage,
    open_client,
    release_embedding_usage,
    reserve_embedding_usage,
    settle_embedding_usage,
)
from ledger_sync.services.semantic_search_errors import failure_message, provider_error

_ROWS_CHANGED = "Some rows changed while indexing. They stay pending; try again shortly."


def semantic_status(session: Session, user_id: int, excluded: set[str]) -> SemanticSearchStatus:
    """Index coverage and Bedrock readiness. Reads only; nothing is sent anywhere."""
    access = embedding_access(session, user_id)
    state = index_state(session, user_id, excluded)
    app_cap = embedding_settings.embedding_daily_token_limit
    app_funded = access.funding == "app"
    return SemanticSearchStatus(
        available=access.reason is None,
        reason=access.reason,
        message=access.message,
        funding=access.funding,
        model=TITAN_V2_MODEL_ID,
        dimensions=EMBEDDING_DIMENSIONS,
        region=access.region,
        total=state.total,
        indexed=state.indexed,
        pending=len(state.pending),
        batch_size=embedding_settings.embedding_batch_size,
        daily_token_limit=app_cap if app_funded and app_cap > 0 else None,
        tokens_today=app_tokens_today(session, user_id) if app_funded else 0,
    )


def _progress(
    state: IndexState, *, stored: int, failed: int, tokens: int, error: str | None
) -> SemanticIndexBatch:
    pending = max(len(state.pending) - stored, 0)
    return SemanticIndexBatch(
        embedded=stored,
        failed=failed,
        total=state.total,
        indexed=state.indexed + stored,
        pending=pending,
        done=pending == 0,
        input_tokens=tokens,
        cost_usd=usd_cost(tokens),
        error=error,
    )


def _billed_tokens(outcomes: Sequence[EmbedOutcome], estimates: Sequence[int]) -> int:
    """Bedrock's own count for each success; the estimate for a failure it may have run."""
    return sum(
        outcome.input_tokens if isinstance(outcome, Embedded) else estimate
        for outcome, estimate in zip(outcomes, estimates, strict=True)
        if isinstance(outcome, Embedded) or outcome.billable
    )


def _store_vectors(
    session: Session, user_id: int, vectors: Sequence[tuple[PendingRow, NDArray[np.float32]]]
) -> int:
    """Store in a transaction of their own; the settlement is already committed.

    The usage lock keeps two tabs from inserting the same row. A row hard-deleted
    since the batch was read breaks the foreign key; one retry re-reads which
    rows still exist, so the rest of the batch is kept.
    """
    for _ in range(2):
        try:
            lock_user_usage(session, user_id)
            stored = store_embeddings(session, user_id, vectors)
            session.commit()
        except IntegrityError:
            session.rollback()
        else:
            return stored
    return 0


def _embed_and_settle(
    session: Session,
    user_id: int,
    access: EmbeddingAccess,
    client: BedrockRuntime,
    batch: Sequence[PendingRow],
) -> tuple[list[tuple[PendingRow, NDArray[np.float32]]], list[EmbedFailure], int]:
    """Reserve, call Bedrock with no transaction open, then commit what was billed."""
    estimates = [estimate_tokens(row.text) for row in batch]
    reservation_id = reserve_embedding_usage(session, user_id, access, sum(estimates))
    outcomes = embed_many(
        client,
        [row.text for row in batch],
        dimensions=EMBEDDING_DIMENSIONS,
        concurrency=embedding_settings.embedding_concurrency,
    )
    failures = [outcome for outcome in outcomes if isinstance(outcome, EmbedFailure)]
    billed = _billed_tokens(outcomes, estimates)
    if billed == 0:
        release_embedding_usage(session, user_id, reservation_id)
        raise provider_error(failures)
    settle_embedding_usage(session, user_id, reservation_id, billed)
    session.commit()
    vectors = [
        (row, outcome.vector)
        for row, outcome in zip(batch, outcomes, strict=True)
        if isinstance(outcome, Embedded)
    ]
    return vectors, failures, billed


def index_batch(session: Session, user_id: int, excluded: set[str]) -> SemanticIndexBatch:
    """Embed up to one batch of rows that have no vector or whose text changed."""
    access, client = open_client(session, user_id)
    state = index_state(session, user_id, excluded)
    batch = state.pending[: embedding_settings.embedding_batch_size]
    if not batch:
        session.commit()
        return _progress(state, stored=0, failed=0, tokens=0, error=None)

    vectors, failures, billed = _embed_and_settle(session, user_id, access, client, batch)
    stored = _store_vectors(session, user_id, vectors)
    error = failure_message(failures) if failures else None
    if error is None and stored < len(vectors):
        error = _ROWS_CHANGED
    return _progress(state, stored=stored, failed=len(failures), tokens=billed, error=error)


def embed_query(session: Session, user_id: int, text: str) -> NDArray[np.float32]:
    """Embed one search text, billed to this user: reserve, call, settle."""
    access, client = open_client(session, user_id)
    estimate = estimate_tokens(text)
    reservation_id = reserve_embedding_usage(session, user_id, access, estimate)
    outcome = embed_one(client, text, dimensions=EMBEDDING_DIMENSIONS)
    if isinstance(outcome, EmbedFailure):
        if outcome.billable:
            settle_embedding_usage(session, user_id, reservation_id, estimate)
            session.commit()
        else:
            release_embedding_usage(session, user_id, reservation_id)
        raise provider_error([outcome])
    settle_embedding_usage(session, user_id, reservation_id, outcome.input_tokens)
    session.commit()
    return outcome.vector


def remove_index(session: Session, user_id: int) -> SemanticIndexDeleted:
    """Remove every vector this user has. Searching needs a new index afterwards."""
    deleted = delete_index(session, user_id)
    session.commit()
    return SemanticIndexDeleted(deleted=deleted)
