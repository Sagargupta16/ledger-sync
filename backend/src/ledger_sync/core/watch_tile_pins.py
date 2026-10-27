"""Pin, unpin and reorder the saved views shown as Dashboard watch tiles.

Every read and write is scoped to one user: a view id the user does not own is
"not found", never another user's view. Writes only stage changes; the router
commits, and retries once when a concurrent request committed the same pin
(or the same category view) first.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import and_, delete, func, select
from sqlalchemy.orm import Session

from ledger_sync.db.models import SavedFilterView, SavedViewPin
from ledger_sync.schemas.watch_tiles import MAX_PINS

#: The type a category suggestion's view filters to, in the Transactions page's
#: own FilterValues spelling, so the view opens there exactly as it sums here.
CATEGORY_VIEW_TYPE = "Expense"
_NAME_LIMIT = 100
_NAME_SUFFIXES = ("", " (watch)", " (watch 2)", " (watch 3)")
_LIMIT_MESSAGE = f"You can pin up to {MAX_PINS} saved views. Unpin one first."


class PinRejectedError(ValueError):
    """The pin cannot be added as asked; the message says why."""


class ViewNotFoundError(LookupError):
    """No saved view with this id belongs to the user."""


def parse_view_filters(raw: str) -> dict[str, Any]:
    """A stored view's filter object; unreadable or non-object JSON reads as no filters.

    The views list, the tiles and the category pin all read stored filters
    through this one rule, so a tile never disagrees with the page about what
    a damaged view filters.
    """
    try:
        parsed = json.loads(raw)
    except TypeError, ValueError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def list_pins(db: Session, user_id: int) -> list[tuple[SavedViewPin, SavedFilterView]]:
    """The user's pins with their views, in tile order."""
    stmt = (
        select(SavedViewPin, SavedFilterView)
        .join(
            SavedFilterView,
            and_(
                SavedFilterView.id == SavedViewPin.view_id,
                SavedFilterView.user_id == SavedViewPin.user_id,
            ),
        )
        .where(SavedViewPin.user_id == user_id)
        .order_by(SavedViewPin.position, SavedViewPin.id)
    )
    return [(pin, view) for pin, view in db.execute(stmt).tuples()]


def pin_view(db: Session, user_id: int, view_id: int) -> SavedViewPin:
    """Pin the user's view at the end of the order; an existing pin is returned as is."""
    owned = db.scalar(
        select(SavedFilterView.id).where(
            SavedFilterView.id == view_id, SavedFilterView.user_id == user_id
        )
    )
    if owned is None:
        raise ViewNotFoundError("Saved view not found")
    return _pin_owned_view(db, user_id, view_id)


def unpin_view(db: Session, user_id: int, view_id: int) -> None:
    """Remove the pin, if any. Idempotent like the saved-view delete."""
    db.execute(
        delete(SavedViewPin).where(SavedViewPin.user_id == user_id, SavedViewPin.view_id == view_id)
    )


def reorder_pins(db: Session, user_id: int, view_ids: list[int]) -> list[SavedViewPin]:
    """Put the listed pins first, in that order, then the rest in their current order.

    Ids that are not pinned are skipped, so a list made before another tab
    pinned or unpinned something still applies instead of failing.
    """
    pins = list(
        db.scalars(
            select(SavedViewPin)
            .where(SavedViewPin.user_id == user_id)
            .order_by(SavedViewPin.position, SavedViewPin.id)
        )
    )
    by_view = {pin.view_id: pin for pin in pins}
    listed = [by_view[view_id] for view_id in view_ids if view_id in by_view]
    rest = [pin for pin in pins if pin.view_id not in set(view_ids)]
    ordered = listed + rest
    for position, pin in enumerate(ordered):
        pin.position = position
    db.flush()
    return ordered


def pin_category(db: Session, user_id: int, category: str) -> tuple[SavedFilterView, SavedViewPin]:
    """Pin a category's spending, reusing a saved view that already shows exactly it.

    Otherwise a view named after the category is created. A name another view
    already holds gets a suffix rather than overwriting that view, which the
    name-keyed upsert of ``POST /api/saved-views`` would do. The category is
    kept exactly as sent: the view filters by equality with the ledger value.
    """
    wanted = {"category": category, "type": CATEGORY_VIEW_TYPE}
    views = list(db.scalars(select(SavedFilterView).where(SavedFilterView.user_id == user_id)))
    view = next((v for v in views if _filter_values(v.filters) == wanted), None)
    if view is None:
        if _pin_count(db, user_id) >= MAX_PINS:
            raise PinRejectedError(_LIMIT_MESSAGE)  # before creating a view nobody pins
        view = SavedFilterView(
            user_id=user_id,
            name=_free_name(category, {v.name for v in views}),
            filters=json.dumps(wanted),
        )
        db.add(view)
        db.flush()
    return view, _pin_owned_view(db, user_id, view.id)


def _pin_owned_view(db: Session, user_id: int, view_id: int) -> SavedViewPin:
    existing = db.scalar(
        select(SavedViewPin).where(SavedViewPin.user_id == user_id, SavedViewPin.view_id == view_id)
    )
    if existing is not None:
        return existing
    if _pin_count(db, user_id) >= MAX_PINS:
        raise PinRejectedError(_LIMIT_MESSAGE)
    last = db.scalar(select(func.max(SavedViewPin.position)).where(SavedViewPin.user_id == user_id))
    pin = SavedViewPin(user_id=user_id, view_id=view_id, position=0 if last is None else last + 1)
    db.add(pin)
    db.flush()
    return pin


def _pin_count(db: Session, user_id: int) -> int:
    count = db.scalar(
        select(func.count()).select_from(SavedViewPin).where(SavedViewPin.user_id == user_id)
    )
    return count or 0


def _filter_values(raw: str) -> dict[str, Any]:
    """A stored filter object without its empty fields, which filter nothing."""
    return {key: value for key, value in parse_view_filters(raw).items() if value not in (None, "")}


def _free_name(category: str, taken: set[str]) -> str:
    """The category as a view name, suffixed when another view holds the name."""
    base = category.strip() or CATEGORY_VIEW_TYPE
    for suffix in _NAME_SUFFIXES:
        name = base[: _NAME_LIMIT - len(suffix)].rstrip() + suffix
        if name not in taken:
            return name
    raise PinRejectedError("Rename one of the saved views named after this category first.")
