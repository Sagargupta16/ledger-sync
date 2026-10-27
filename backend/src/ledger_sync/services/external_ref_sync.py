"""Keep rows an import created in step with their source, through ``external_refs``.

Each imported row is linked by (kind, source UID) to the local row it became,
with a fingerprint of the values the import last wrote:

- a linked row nobody touched since follows the source: it is updated, or
  switched off when the source item is gone;
- a linked row edited in Ledger Sync no longer matches its fingerprint, so it
  keeps the edit and is counted as kept;
- a linked row deleted in Ledger Sync comes back while the source still has
  the item, the way a deleted transaction comes back from the next backup;
- a row with no link was made by hand and is never changed. When it holds
  the scope an imported row needs (one budget per category), the import
  skips that item as a conflict.

Nothing is written unless ``apply`` is set, so a dry run reports the same
counts an import would.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from collections.abc import Callable, Hashable, Mapping
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.db.models import ExternalRef

type Values = Mapping[str, object]
type Scope = Callable[[Values], Hashable]


@dataclass(slots=True)
class Tally:
    """Counts for one kind; ``found`` is set by whoever reads the source."""

    found: int = 0
    added: int = 0
    updated: int = 0
    unchanged: int = 0
    kept: int = 0
    removed: int = 0
    skipped: Counter[str] = field(default_factory=Counter)

    @property
    def changed(self) -> bool:
        return bool(self.added or self.updated or self.removed)


def fingerprint(values: Values) -> str:
    """SHA-256 of the values in a stable text form (2-decimal money, ISO dates)."""
    return hashlib.sha256(json.dumps(_plain(values), sort_keys=True).encode()).hexdigest()


def _plain(values: Values) -> dict[str, object]:
    plain: dict[str, object] = {}
    for key, value in values.items():
        if isinstance(value, Decimal):
            plain[key] = str(value.quantize(Decimal("0.01")))
        elif isinstance(value, date):
            plain[key] = value.isoformat()
        elif isinstance(value, Enum):
            plain[key] = value.value
        else:
            plain[key] = value
    return plain


@dataclass(slots=True)
class LinkedRows:
    """One kind of imported row: its model, the columns the import owns, its links."""

    db: Session
    user_id: int
    system: str
    kind: str
    model: Any
    columns: tuple[str, ...]
    apply: bool
    # A key no two rows may share (a budget's category), or None.
    scope: Scope | None = None
    refs: dict[str, ExternalRef] = field(init=False)
    rows: dict[int, Any] = field(init=False)
    by_scope: dict[Hashable, object] = field(init=False)
    # Links whose row was gone when the sync began. SQLite can give a new row
    # that id again, so these never look a row up: their item gets a new row.
    dangling: set[str] = field(init=False)
    # Set by sync: links to items the source dropped, and the untouched rows
    # among theirs that a new item may take over, by scope.
    stale: dict[str, ExternalRef] = field(init=False)
    spare: dict[Hashable, ExternalRef] = field(init=False)

    def __post_init__(self) -> None:
        self.refs = {
            ref.source_uid: ref
            for ref in self.db.scalars(
                select(ExternalRef).where(
                    ExternalRef.user_id == self.user_id,
                    ExternalRef.source_system == self.system,
                    ExternalRef.kind == self.kind,
                )
            )
        }
        query = select(self.model).where(self.model.user_id == self.user_id)
        if self.scope is None:
            query = query.where(self.model.id.in_({ref.local_id for ref in self.refs.values()}))
        # With a scope, every row of the user counts: hand-made rows hold scopes too.
        self.rows = {row.id: row for row in self.db.scalars(query)}
        self.dangling = {uid for uid, ref in self.refs.items() if ref.local_id not in self.rows}
        self.stale, self.spare, self.by_scope = {}, {}, {}
        for row in self.rows.values():
            self._claim(row, self._values(row))

    def sync(self, desired: dict[str, Values], tally: Tally) -> None:
        """Place every desired item, then switch off linked rows the source dropped."""
        self.stale = {uid: ref for uid, ref in self.refs.items() if uid not in desired}
        for uid, ref in self.stale.items():
            row = self._linked_row(uid)
            if self.scope and row is not None and not self._edited(row, ref):
                self.spare[self.scope(self._values(row))] = ref
        for uid in sorted(desired):
            self._place(uid, desired[uid], tally)
        for uid, ref in self.stale.items():
            self._retire(uid, ref, tally)

    def _place(self, uid: str, values: Values, tally: Tally) -> None:
        ref = self.refs.get(uid)
        row = self._linked_row(uid)
        if ref is not None and row is not None:
            self._follow(row, ref, values, tally)
            return
        holder = self._holder(values)
        if holder is None:
            self._insert(uid, values, ref)
            tally.added += 1
        elif self._take_over(uid, values, ref, holder):
            tally.updated += 1
        else:
            tally.skipped["conflict"] += 1

    def _follow(self, row: Any, ref: ExternalRef, values: Values, tally: Tally) -> None:
        """A linked row keeps an edit made here, else takes the source's values."""
        if self._edited(row, ref):
            tally.kept += 1
        elif _plain(self._values(row)) == _plain(values):
            tally.unchanged += 1
        elif self._holder(values) not in (None, row):
            tally.skipped["conflict"] += 1
        else:
            self._write(row, values, ref)
            tally.updated += 1

    def _take_over(self, uid: str, values: Values, ref: ExternalRef | None, holder: object) -> bool:
        """Let a dropped item's untouched row, which holds this item's scope, stand for it."""
        taken = self.spare.pop(self.scope(values), None) if self.scope else None
        if taken is None or holder is not self.rows.get(taken.local_id):
            return False
        self.stale.pop(taken.source_uid)
        if self.apply:
            if ref is None:
                taken.source_uid = uid
                ref = taken
            else:
                ref.local_id = taken.local_id
                self.db.delete(taken)
            self.refs[uid] = ref
        self._write(holder, values, ref)
        return True

    def _linked_row(self, uid: str) -> Any | None:
        ref = self.refs.get(uid)
        if ref is None or uid in self.dangling:
            return None
        return self.rows.get(ref.local_id)

    def _retire(self, uid: str, ref: ExternalRef, tally: Tally) -> None:
        row = self._linked_row(uid)
        if row is None:
            # Both the item and its row are gone; the link has nothing left to name.
            if self.apply:
                self.db.delete(ref)
        elif row.is_active and not self._edited(row, ref):
            self._write(row, {**self._values(row), "is_active": False}, ref)
            tally.removed += 1

    def _insert(self, uid: str, values: Values, ref: ExternalRef | None) -> None:
        if not self.apply:
            # Hold the scope the way the new row will, so the dry run counts the same.
            self._claim(object(), values)
            return
        row = self.model(user_id=self.user_id, **values)
        self.db.add(row)
        self.db.flush()
        if ref is None:
            ref = ExternalRef(
                user_id=self.user_id,
                source_system=self.system,
                kind=self.kind,
                source_uid=uid,
                local_id=row.id,
                fingerprint=fingerprint(values),
            )
            self.db.add(ref)
            self.refs[uid] = ref
        else:
            ref.local_id = row.id
            ref.fingerprint = fingerprint(values)
        self.rows[row.id] = row
        self._claim(row, values)

    def _write(self, row: Any, values: Values, ref: ExternalRef | None) -> None:
        if self.apply and ref is not None:
            for column in self.columns:
                setattr(row, column, values[column])
            ref.fingerprint = fingerprint(values)
        self._claim(row, values)

    def _holder(self, values: Values) -> object | None:
        return self.by_scope.get(self.scope(values)) if self.scope else None

    def _claim(self, row: object, values: Values) -> None:
        if self.scope is None:
            return
        self.by_scope = {key: held for key, held in self.by_scope.items() if held is not row}
        self.by_scope[self.scope(values)] = row

    def _values(self, row: Any) -> dict[str, object]:
        return {column: getattr(row, column) for column in self.columns}

    def _edited(self, row: Any, ref: ExternalRef) -> bool:
        return fingerprint(self._values(row)) != ref.fingerprint
