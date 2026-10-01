"""Saved filter view API endpoints.

Named snapshots of the Transactions page filter state. The ``filters``
payload is an opaque JSON object echoed verbatim -- the backend never
validates its keys, so new frontend filter fields need zero backend
changes. POST upserts by (user, name).
"""

import json

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

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
def list_saved_views(
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
def save_view(
    payload: SavedViewCreateRequest,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> SavedViewResponse:
    """Create or update a saved view -- UPSERT by (user, name).

    If a view with this name already exists for the user, its filters
    and updated_at are overwritten and the existing id is returned.
    Always 200, never 201/409, so the frontend "Save current view" flow
    can blindly POST without checking name collisions. Two concurrent saves
    of a new name race on the unique (user, name) index; the loser rolls back
    and updates the winner's row, so both still get 200.
    """
    user_id = current_user.id
    filters = json.dumps(payload.filters)
    stmt = select(SavedFilterView).where(
        SavedFilterView.user_id == user_id,
        SavedFilterView.name == payload.name,
    )
    view = db.execute(stmt).scalar_one_or_none()

    if view is not None:
        view.filters = filters
        db.commit()
    else:
        view = SavedFilterView(user_id=user_id, name=payload.name, filters=filters)
        db.add(view)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            view = db.execute(stmt).scalar_one()
            view.filters = filters
            db.commit()

    db.refresh(view)
    return _to_view_response(view)


@router.delete("/{view_id}", status_code=204)
def delete_saved_view(
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
