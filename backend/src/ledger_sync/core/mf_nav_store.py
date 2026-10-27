"""The AMFI NAV cache: one row per lookup key that some held scheme asked for.

Public AMFI data, not user data, so these queries carry no ``user_id``. Callers
own the session; ``save_navs`` commits its own writes.
"""

from __future__ import annotations

from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, cast

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from ledger_sync.core.amfi_nav import NavQuote
from ledger_sync.db.models import MfNavPrice

_CHUNK = 100  # six columns per NAV row stay under SQLite's 999 bind limit
_NAV_TABLE = cast(sa.Table, MfNavPrice.__table__)


@dataclass(frozen=True, slots=True)
class CachedNav:
    nav: Decimal | None
    nav_date: date | None
    checked_at: datetime


def _chunks[T](items: Sequence[T]) -> list[Sequence[T]]:
    return [items[start : start + _CHUNK] for start in range(0, len(items), _CHUNK)]


def load_navs(db: Session, keys: Collection[str]) -> dict[str, CachedNav]:
    found: dict[str, CachedNav] = {}
    for chunk in _chunks(sorted(keys)):
        for row in db.scalars(sa.select(MfNavPrice).where(MfNavPrice.lookup_key.in_(chunk))):
            found[row.lookup_key] = CachedNav(row.nav, row.nav_date, row.checked_at)
    return found


def save_navs(
    db: Session, quotes: Mapping[str, NavQuote], checked: Collection[str], checked_at: datetime
) -> None:
    """Record a download: new NAVs for keys it listed, a check time for every key.

    A key the file did not list keeps its last NAV, so one bad day of AMFI data
    cannot blank a valuation. Rows go in sorted key order: two instances saving
    overlapping keys then take their row locks in the same order, so PostgreSQL
    cannot deadlock them.
    """
    found: list[dict[str, Any]] = [
        {
            "lookup_key": key,
            "scheme_code": quotes[key].scheme_code[:16],
            "scheme_name": quotes[key].scheme_name[:500],
            "nav": quotes[key].nav,
            "nav_date": quotes[key].nav_date,
            "checked_at": checked_at,
        }
        for key in sorted(quotes)
    ]
    missing: list[dict[str, Any]] = [
        {"lookup_key": key, "checked_at": checked_at}
        for key in sorted(checked)
        if key not in quotes
    ]
    _upsert(db, found, ("scheme_code", "scheme_name", "nav", "nav_date", "checked_at"))
    _upsert(db, missing, ("checked_at",))
    db.commit()


def _upsert(db: Session, rows: list[dict[str, Any]], updated: tuple[str, ...]) -> None:
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    for chunk in _chunks(rows):
        statement = insert(_NAV_TABLE).values(list(chunk))
        updates = {name: statement.excluded[name] for name in updated}
        db.execute(statement.on_conflict_do_update(index_elements=["lookup_key"], set_=updates))
