"""Category suggestion endpoints, learned per user from their own categorised rows.

Both routes are read-only: GET /status says whether the model is on yet, and
POST scores unsaved upload rows (a POST only because the rows travel in the
body). The model, its thresholds and its cache live in
``core/category_suggester.py`` and the ``category_suggester_*`` modules next to it.
"""

from fastapi import APIRouter, Request

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.api.rate_limit import user_limiter
from ledger_sync.core import category_suggester as suggester
from ledger_sync.core import category_suggester_store as store
from ledger_sync.core.category_suggester_features import PLACEHOLDER_LABELS
from ledger_sync.schemas.category_suggestions import (
    CategorySuggestionResponse,
    CategorySuggestionRowsRequest,
    CategorySuggestionStatusResponse,
    RowCategorySuggestionsResponse,
)

router = APIRouter(prefix="/api/category-suggestions", tags=["category-suggestions"])


def _to_response(items: list[suggester.CategorySuggestion]) -> list[CategorySuggestionResponse]:
    return [
        CategorySuggestionResponse(
            category=item.category, subcategory=item.subcategory, confidence=item.confidence
        )
        for item in items
    ]


@router.get("/status")
def get_suggestion_status(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> CategorySuggestionStatusResponse:
    """Whether the model is on, with how much it learned from and its thresholds."""
    model = store.load_model(db, current_user.id)
    return CategorySuggestionStatusResponse(
        ready=model.ready,
        training_rows=model.training_rows,
        category_count=model.category_count,
        min_training_rows=store.MIN_TRAINING_ROWS,
        min_categories=store.MIN_CATEGORIES,
        confidence_floor=suggester.CONFIDENCE_FLOOR,
        placeholder_labels=sorted(PLACEHOLDER_LABELS),
    )


@router.post("", responses={429: {"description": "Rate limit exceeded"}})
@user_limiter.limit("30/minute")
def suggest_for_upload_rows(
    request: Request,  # required by slowapi
    payload: CategorySuggestionRowsRequest,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> RowCategorySuggestionsResponse:
    """Top two suggestions for unsaved upload rows, in request order. Saves nothing.

    A row an active categorization rule will recategorize on import gets [] and
    is counted in ``rule_matched``.
    """
    rows = [row.model_dump() for row in payload.rows]
    result = suggester.suggest_for_rows(db, current_user.id, rows)
    return RowCategorySuggestionsResponse(
        ready=result.ready,
        suggestions=[_to_response(items) for items in result.suggestions],
        rule_matched=result.rule_matched,
    )
