"""Review queue endpoints: recent unreviewed rows, keep or change a category, undo.

The queue is built in ``core/review_queue.py`` and decisions are recorded in
``core/category_override_reviews.py``; ``core/category_overrides.py`` replays a
change on every import. A change rewrites the row and marks its day for
analytics without refreshing: the page refreshes once when the user finishes,
not after every card.
"""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.category_override_reviews import (
    TransactionNotFoundError,
    TransferNotReviewableError,
    record_review,
    undo_review,
)
from ledger_sync.core.review_queue import build_review_queue
from ledger_sync.schemas.review_queue import ReviewQueueResponse, ReviewRequest, ReviewResponse

router = APIRouter(prefix="/api/review-queue", tags=["review-queue"])

TransactionId = Annotated[str, Path(min_length=1, max_length=64)]


@router.get("")
def get_review_queue(
    current_user: CurrentUser,
    db: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    days: Annotated[int, Query(ge=7, le=366)] = 30,
) -> ReviewQueueResponse:
    """The newest unreviewed income and expense rows of the last ``days`` days."""
    return build_review_queue(db, current_user, limit=limit, days=days)


@router.put(
    "/{transaction_id}",
    responses={
        404: {"description": "Transaction not found"},
        422: {"description": "Transfers are not reviewed, or the request is invalid"},
    },
)
def review_transaction(
    transaction_id: TransactionId,
    payload: ReviewRequest,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> ReviewResponse:
    """Keep the row's category, or change it; a change survives every later import."""
    user_id = current_user.id
    category = payload.category if payload.action == "change" else None
    try:
        override = record_review(
            db, user_id, transaction_id, category=category, subcategory=payload.subcategory
        )
    except TransactionNotFoundError as error:
        raise HTTPException(status_code=404, detail="Transaction not found") from error
    except TransferNotReviewableError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return ReviewResponse(
        transaction_id=override.transaction_id,
        decision="change" if override.decision == "change" else "keep",
        category=override.category,
        subcategory=override.subcategory,
        imported_category=override.imported_category,
        imported_subcategory=override.imported_subcategory,
    )


@router.delete("/{transaction_id}", status_code=204)
def undo_transaction_review(
    transaction_id: TransactionId,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> None:
    """Undo a review and restore the imported category. A row with no review is also a 204."""
    undo_review(db, current_user.id, transaction_id)
