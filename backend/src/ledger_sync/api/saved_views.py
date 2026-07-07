"""Saved filter view API endpoints.

Named snapshots of the Transactions page filter state. The ``filters``
payload is an opaque JSON object echoed verbatim -- the backend never
validates its keys, so new frontend filter fields need zero backend
changes. POST upserts by (user, name).
"""

import json

from fastapi import APIRouter
from sqlalchemy import select

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import SavedFilterView
from ledger_sync.schemas.saved_views import SavedViewCreateRequest, SavedViewResponse

router = APIRouter(prefix="/api/saved-views", tags=["saved-views"])


def _to_view_response(view: SavedFilterView) -> SavedViewResponse:
    """Convert a SavedFilterView model to a SavedViewResponse."""
    try:
        filters = json.loads(view.filters)
        if not isinstance(filters, dict):
            filters = {}
    except (TypeError, ValueError):
        filters = {}
    return SavedViewResponse(
        id=view.id,
        name=view.name,
        filters=filters,
        created_at=view.created_at.isoformat(),
        updated_at=view.updated_at.isoformat(),
    )


@router.get("")
async def list_saved_views(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> list[SavedViewResponse]:
    """List the user's saved views ordered by name."""
    stmt = (
        select(SavedFilterView)
        .where(SavedFilterView.user_id == current_user.id)
        .order_by(SavedFilterView.name.asc())
    )
    views = db.execute(stmt).scalars().all()
    return [_to_view_response(view) for view in views]


@router.post("")
async def save_view(
    payload: SavedViewCreateRequest,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> SavedViewResponse:
    """Create or update a saved view -- UPSERT by (user, name).

    If a view with this name already exists for the user, its filters
    and updated_at are overwritten and the existing id is returned.
    Always 200, never 201/409, so the frontend "Save current view" flow
    can blindly POST without checking name collisions.
    """
    stmt = select(SavedFilterView).where(
        SavedFilterView.user_id == current_user.id,
        SavedFilterView.name == payload.name,
    )
    view = db.execute(stmt).scalar_one_or_none()

    if view is not None:
        view.filters = json.dumps(payload.filters)
    else:
        view = SavedFilterView(
            user_id=current_user.id,
            name=payload.name,
            filters=json.dumps(payload.filters),
        )
        db.add(view)

    db.commit()
    db.refresh(view)
    return _to_view_response(view)


@router.delete("/{view_id}", status_code=204)
async def delete_saved_view(
    view_id: int,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> None:
    """Delete a saved view. Idempotent: a nonexistent id is also a 204."""
    stmt = select(SavedFilterView).where(
        SavedFilterView.id == view_id,
        SavedFilterView.user_id == current_user.id,
    )
    view = db.execute(stmt).scalar_one_or_none()
    if view is not None:
        db.delete(view)
        db.commit()
