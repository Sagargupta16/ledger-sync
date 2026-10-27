"""Saved filter view API endpoints.

Named snapshots of the Transactions page filter state. The ``filters``
payload is an opaque JSON object echoed verbatim -- the backend never
validates its keys, so new frontend filter fields need zero backend
changes. POST upserts by (user, name).

A view can also be pinned to the Dashboard as a watch tile. The tiles
endpoint is the one place the backend reads ``filters``: it validates them
with the search endpoint's own model, so a tile sums what its view lists.
"""

import json
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.api.saved_views_tiles import build_tiles
from ledger_sync.core.watch_tile_pins import (
    PinRejectedError,
    ViewNotFoundError,
    parse_view_filters,
    pin_category,
    pin_view,
    reorder_pins,
    unpin_view,
)
from ledger_sync.db.models import SavedFilterView
from ledger_sync.schemas.saved_views import SavedViewCreateRequest, SavedViewResponse
from ledger_sync.schemas.watch_tiles import (
    WatchCategoryPinRequest,
    WatchCategoryPinResponse,
    WatchPin,
    WatchPinOrderRequest,
    WatchTilesResponse,
)

router = APIRouter(prefix="/api/saved-views", tags=["saved-views"])

_PIN_ERRORS: dict[int | str, dict[str, Any]] = {
    404: {"description": "No such saved view for this user"},
    409: {"description": "Pin limit reached, or no free view name"},
}


def _to_view_response(view: SavedFilterView) -> SavedViewResponse:
    """Convert a SavedFilterView model to a SavedViewResponse."""
    return SavedViewResponse(
        id=view.id,
        name=view.name,
        filters=parse_view_filters(view.filters),
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


# --- Dashboard watch tiles (pinned views) ---
# Deleting a view drops its pin through the foreign key's ON DELETE CASCADE.


def _commit_pin[T](db: Session, write: Callable[[], T]) -> T:
    """Run *write* and commit; after losing a race on a unique key, run it once more.

    The rerun sees the row the other request committed and returns it, so two
    taps on one pin both succeed, as two saves of one view name do above.
    """
    try:
        try:
            result = write()
            db.commit()
        except IntegrityError:
            db.rollback()
            result = write()
            db.commit()
    except ViewNotFoundError as e:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(e)) from e
    except PinRejectedError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(e)) from e
    return result


@router.get("/tiles")
def get_watch_tiles(current_user: CurrentUser, db: DatabaseSession) -> WatchTilesResponse:
    """Pinned views as Dashboard tiles: month to date, same days last month, 6-month trend.

    With nothing pinned, ``suggestions`` lists last month's top spending
    categories for one-tap pins (``POST /pins/category``).
    """
    return build_tiles(db, current_user)


@router.put("/pins/order")
def reorder_watch_tiles(
    payload: WatchPinOrderRequest, current_user: CurrentUser, db: DatabaseSession
) -> list[WatchPin]:
    """Reorder the tiles; pins missing from ``view_ids`` follow in their current order."""
    pins = reorder_pins(db, current_user.id, payload.view_ids)
    db.commit()
    return [WatchPin(view_id=pin.view_id, position=pin.position) for pin in pins]


@router.post("/pins/category", responses=_PIN_ERRORS)
def pin_watch_category(
    payload: WatchCategoryPinRequest, current_user: CurrentUser, db: DatabaseSession
) -> WatchCategoryPinResponse:
    """Pin a category's spending, reusing or creating its saved view."""
    view, pin = _commit_pin(db, lambda: pin_category(db, current_user.id, payload.category))
    return WatchCategoryPinResponse(view_id=view.id, name=view.name, position=pin.position)


@router.put("/{view_id}/pin", responses=_PIN_ERRORS)
def pin_saved_view(view_id: int, current_user: CurrentUser, db: DatabaseSession) -> WatchPin:
    """Pin a view at the end of the tiles. Idempotent: an existing pin keeps its place."""
    pin = _commit_pin(db, lambda: pin_view(db, current_user.id, view_id))
    return WatchPin(view_id=pin.view_id, position=pin.position)


@router.delete("/{view_id}/pin", status_code=204)
def unpin_saved_view(view_id: int, current_user: CurrentUser, db: DatabaseSession) -> None:
    """Unpin a view; the view itself stays. Idempotent, like the view delete."""
    unpin_view(db, current_user.id, view_id)
    db.commit()
