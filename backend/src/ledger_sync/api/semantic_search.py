"""Semantic transaction search with opt-in Titan Text Embeddings V2 vectors.

- ``GET /status``: whether Bedrock is usable for this user, and index coverage.
- ``POST /index``: embed the next batch of new or changed rows; call until done.
- ``GET ""``: rank this user's rows by meaning (``q``, ``limit`` plus the
  Transactions page filters; ``query`` is ignored, ``q`` is the search text).
- ``DELETE /index``: remove the index, opting out again.

Nothing is embedded until the user starts indexing. Only note, category,
subcategory and account text is sent, never amounts or dates. Every Bedrock
call is reserved in ``ai_usage_log`` first and settled after, and no database
transaction stays open across a call. This module is HTTP only: limits, the
page filters and the response rows. The Bedrock and usage sequence lives in
``services.semantic_search_service``; text, staleness and ranking in
``core.semantic_search``.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.api.rate_limit import limiter, user_limiter
from ledger_sync.api.transactions_impl.filters import (
    SearchFilters,
    _apply_search_filters,
    _apply_tag_filter,
)
from ledger_sync.api.transactions_impl.serialize import (
    _tags_for_transactions,
    _to_transaction_response,
)
from ledger_sync.core.embeddings import TITAN_V2_MODEL_ID
from ledger_sync.core.query_helpers import build_transaction_query, excluded_accounts_for
from ledger_sync.core.semantic_search import indexed_count, nearest
from ledger_sync.db.models import Transaction
from ledger_sync.schemas.semantic_search import (
    SemanticIndexBatch,
    SemanticIndexDeleted,
    SemanticSearchResponse,
    SemanticSearchResult,
    SemanticSearchStatus,
)
from ledger_sync.services.semantic_search_service import (
    embed_query,
    index_batch,
    remove_index,
    semantic_status,
)

router = APIRouter(prefix="/api/semantic-search", tags=["semantic-search"])

_PROVIDER_ERRORS: dict[int | str, dict[str, Any]] = {
    400: {"description": "This user's AI settings cannot reach Bedrock"},
    429: {"description": "A token budget is spent or Bedrock is throttling"},
    502: {"description": "Bedrock failed or rejected the embedding call"},
    503: {"description": "Bedrock is not configured on the server"},
}


def _result_rows(
    session: Session, user_id: int, ranked: list[tuple[Transaction, float]]
) -> list[SemanticSearchResult]:
    tags = _tags_for_transactions(session, user_id, [tx.transaction_id for tx, _ in ranked])
    return [
        SemanticSearchResult(
            transaction=_to_transaction_response(tx, tags.get(tx.transaction_id)),
            score=round(score, 4),
        )
        for tx, score in ranked
    ]


@router.get("/status")
def get_semantic_search_status(
    current_user: CurrentUser, session: DatabaseSession
) -> SemanticSearchStatus:
    """Index coverage and Bedrock readiness. Reads only; nothing is sent anywhere."""
    return semantic_status(session, current_user.id, excluded_accounts_for(current_user))


@router.post("/index", responses=_PROVIDER_ERRORS)
@user_limiter.limit("30/minute")
@limiter.limit("60/minute")
def index_next_batch(
    request: Request,  # unused in body; slowapi requires a `request: Request` parameter
    current_user: CurrentUser,
    session: DatabaseSession,
) -> SemanticIndexBatch:
    """Embed up to one batch of rows that have no vector or whose text changed."""
    return index_batch(session, current_user.id, excluded_accounts_for(current_user))


@router.get("", responses=_PROVIDER_ERRORS)
@user_limiter.limit("60/minute")
@limiter.limit("120/minute")
def semantic_search(
    request: Request,  # unused in body; slowapi requires a `request: Request` parameter
    current_user: CurrentUser,
    session: DatabaseSession,
    filters: Annotated[SearchFilters, Depends()],
    q: Annotated[str, Query(min_length=1, max_length=200, description="What to look for")],
    limit: Annotated[int, Query(ge=1, le=100, description="Maximum results")] = 25,
) -> SemanticSearchResponse:
    """This user's closest rows to ``q`` by meaning, best first, within the filters."""
    text = " ".join(q.split())
    if not text:
        raise HTTPException(status_code=422, detail="Enter something to search for.")
    user_id = current_user.id
    indexed = indexed_count(session, user_id, excluded_accounts_for(current_user))
    if indexed == 0:
        # Not opted in yet: answer without calling Bedrock.
        return SemanticSearchResponse(query=text, results=[], indexed=0, model=TITAN_V2_MODEL_ID)

    vector = embed_query(session, user_id, text)
    candidates = build_transaction_query(session, current_user)
    candidates = _apply_search_filters(candidates, filters.model_copy(update={"query": None}))
    candidates = _apply_tag_filter(candidates, user_id, filters.tag)
    ranked = nearest(candidates, vector, limit=limit)
    return SemanticSearchResponse(
        query=text,
        results=_result_rows(session, user_id, ranked),
        indexed=indexed,
        model=TITAN_V2_MODEL_ID,
    )


@router.delete("/index")
def delete_semantic_index(
    current_user: CurrentUser, session: DatabaseSession
) -> SemanticIndexDeleted:
    """Remove every vector this user has. Searching needs a new index afterwards."""
    return remove_index(session, current_user.id)
