"""Compensation preferences backed only by normalized records.

Readers return the existing JSON shapes (Decimal values encoded as strings).
Writers validate the entire update before changing rows, flush but never commit,
and return whether anything changed. The preferences coordinator owns user locks,
committing, audit timestamps and analytics invalidation; legacy columns are not
touched. Clean cached compensation rows are reloaded after the caller's lock;
pending in-transaction edits are preserved.
"""

from __future__ import annotations

from collections import defaultdict, deque
from collections.abc import Iterable, Mapping, Sequence
from typing import Any, cast

from fastapi import HTTPException
from sqlalchemy import inspect, select
from sqlalchemy.orm import InstanceState, Session

from ledger_sync.db._models.compensation import RsuGrantRecord, RsuVestingRecord, SalaryPlan
from ledger_sync.schemas.salary import (
    RsuGrant,
    RsuGrantsConfig,
    RsuVesting,
    SalaryComponents,
    SalaryStructureConfig,
)

COMPENSATION_FIELDS = frozenset({"salary_structure", "rsu_grants"})
_SALARY_FIELDS = tuple(SalaryComponents.model_fields)
_GRANT_FIELDS = ("stock_name", "stock_price", "grant_date", "notes")
_VESTING_FIELDS = ("date", "quantity", "price_at_vest", "net_quantity")
_COMPENSATION_MODELS = (SalaryPlan, RsuGrantRecord, RsuVestingRecord)
type _VestingMatches = list[RsuVestingRecord | None]
type _GrantChanges = tuple[
    dict[str, RsuGrantRecord], dict[int, list[RsuVestingRecord]], list[_VestingMatches]
]


def _attributes(record: Any, fields: Iterable[str]) -> dict[str, Any]:
    return {field: getattr(record, field) for field in fields}


def _expire_clean_compensation(session: Session, owners: set[int]) -> None:
    """Discard pre-lock snapshots without flushing or discarding caller edits.

    Inspect cached state without loading expired attributes. The existing bulk
    queries reload these rows together, so refresh never adds a query per row.
    Unknown owners occur on expired objects and are safe to expire again.
    """
    for cached in list(session.identity_map.values()):
        if not isinstance(cached, _COMPENSATION_MODELS):
            continue
        state = cast(InstanceState[Any], inspect(cached))
        owner = state.dict.get("user_id")
        if owner is not None and owner not in owners:
            continue
        if cached not in session.deleted and not session.is_modified(cached):
            session.expire(cached)


def get_compensation_preferences_bulk(
    session: Session, user_ids: Iterable[int]
) -> dict[int, dict[str, Any]]:
    """Resolve any number of owners with three queries, never one per grant."""
    owners = sorted(set(user_ids))
    result: dict[int, dict[str, Any]] = {
        user_id: {"salary_structure": {}, "rsu_grants": []} for user_id in owners
    }
    if not owners:
        return result
    _expire_clean_compensation(session, set(owners))
    salary_rows = session.scalars(
        select(SalaryPlan)
        .where(SalaryPlan.user_id.in_(owners))
        .order_by(SalaryPlan.user_id, SalaryPlan.position, SalaryPlan.id)
    )
    for plan in salary_rows:
        result[plan.user_id]["salary_structure"][plan.fiscal_year] = SalaryComponents(
            **_attributes(plan, _SALARY_FIELDS)
        ).model_dump(mode="json")
    grants = session.scalars(
        select(RsuGrantRecord)
        .where(RsuGrantRecord.user_id.in_(owners))
        .order_by(RsuGrantRecord.user_id, RsuGrantRecord.position, RsuGrantRecord.id)
    ).all()
    vestings: dict[tuple[int, int], list[RsuVesting]] = defaultdict(list)
    for row in session.scalars(
        select(RsuVestingRecord)
        .where(RsuVestingRecord.user_id.in_(owners))
        .order_by(
            RsuVestingRecord.user_id,
            RsuVestingRecord.grant_id,
            RsuVestingRecord.position,
            RsuVestingRecord.id,
        )
    ):
        vestings[row.user_id, row.grant_id].append(
            RsuVesting(id=row.id, **_attributes(row, _VESTING_FIELDS))
        )
    for grant in grants:
        result[grant.user_id]["rsu_grants"].append(
            RsuGrant(
                id=grant.public_id,
                **_attributes(grant, _GRANT_FIELDS),
                vestings=vestings[grant.user_id, grant.id],
            ).model_dump(mode="json")
        )
    return result


def read_compensation(session: Session, user_id: int) -> dict[str, Any]:
    """Fields to merge into the parent's aggregated preferences response."""
    return get_compensation_preferences_bulk(session, [user_id])[user_id]


def _set_values(row: Any, values: Mapping[str, Any]) -> bool:
    changed = False
    for field, value in values.items():
        if getattr(row, field) != value:
            setattr(row, field, value)
            changed = True
    return changed


def _write_salary(session: Session, user_id: int, salary: Mapping[str, SalaryComponents]) -> bool:
    existing = {
        row.fiscal_year: row
        for row in session.scalars(select(SalaryPlan).where(SalaryPlan.user_id == user_id))
    }
    changed = False
    for position, (fiscal_year, components) in enumerate(salary.items()):
        values = {**components.model_dump(), "position": position}
        row = existing.pop(fiscal_year, None)
        if row is None:
            session.add(SalaryPlan(user_id=user_id, fiscal_year=fiscal_year, **values))
            changed = True
        else:
            changed = _set_values(row, values) or changed
    for row in existing.values():
        session.delete(row)
        changed = True
    return changed


def _fingerprint(vesting: Any) -> tuple[Any, ...]:
    return tuple(getattr(vesting, field) for field in _VESTING_FIELDS)


def _match_vestings(
    existing: Sequence[RsuVestingRecord], incoming: Sequence[RsuVesting]
) -> _VestingMatches:
    """IDs are authoritative; ID-less clients consume exact matches in order.

    Identical legacy events have no observable identity. Preserve the earliest
    remaining occurrence and remove only the excess occurrences. Once a client
    echoes the optional ID, editing/removing any specific duplicate is exact.
    Never infer identity from the date alone or deduplicate equal events.
    """
    by_id = {row.id: row for row in existing}
    reserved = {vesting.id for vesting in incoming if vesting.id is not None}
    if not reserved.issubset(by_id):
        raise ValueError("Vesting ID does not belong to this user's grant.")
    by_value: dict[tuple[Any, ...], deque[RsuVestingRecord]] = defaultdict(deque)
    for row in existing:
        if row.id not in reserved:
            by_value[_fingerprint(row)].append(row)
    matches: list[RsuVestingRecord | None] = []
    for vesting in incoming:
        if vesting.id is not None:
            matches.append(by_id[vesting.id])
        else:
            candidates = by_value[_fingerprint(vesting)]
            matches.append(candidates.popleft() if candidates else None)
    return matches


def _load_grant_changes(
    session: Session, user_id: int, grants: Sequence[RsuGrant]
) -> _GrantChanges:
    existing = {
        row.public_id: row
        for row in session.scalars(select(RsuGrantRecord).where(RsuGrantRecord.user_id == user_id))
    }
    events: dict[int, list[RsuVestingRecord]] = defaultdict(list)
    for row in session.scalars(
        select(RsuVestingRecord)
        .where(RsuVestingRecord.user_id == user_id)
        .order_by(RsuVestingRecord.position, RsuVestingRecord.id)
    ):
        events[row.grant_id].append(row)
    matches: list[_VestingMatches] = []
    for grant in grants:
        old_grant = existing.get(grant.id)
        matches.append(_match_vestings(events[old_grant.id] if old_grant else [], grant.vestings))
    return existing, events, matches


def _write_vestings(
    session: Session,
    grant: RsuGrantRecord,
    incoming: Sequence[RsuVesting],
    matches: Sequence[RsuVestingRecord | None],
    existing: Sequence[RsuVestingRecord],
) -> bool:
    changed = False
    kept = {row.id for row in matches if row is not None}
    for position, (vesting, row) in enumerate(zip(incoming, matches, strict=True)):
        values = {**_attributes(vesting, _VESTING_FIELDS), "position": position}
        if row is None:
            session.add(RsuVestingRecord(user_id=grant.user_id, grant_id=grant.id, **values))
            changed = True
        else:
            changed = _set_values(row, values) or changed
    for row in existing:
        if row.id not in kept:
            session.delete(row)
            changed = True
    return changed


def _write_grants(
    session: Session,
    user_id: int,
    grants: Sequence[RsuGrant],
    changes: _GrantChanges,
) -> bool:
    existing, events, matches = changes
    changed = False
    prepared: list[tuple[RsuGrantRecord, _VestingMatches]] = []
    for position, (grant, matched) in enumerate(zip(grants, matches, strict=True)):
        values = {**_attributes(grant, _GRANT_FIELDS), "position": position}
        row = existing.pop(grant.id, None)
        if row is None:
            row = RsuGrantRecord(user_id=user_id, public_id=grant.id, **values)
            session.add(row)
            # A flush resolves generated parent IDs; no lookup per parent.
            changed = True
        else:
            changed = _set_values(row, values) or changed
        prepared.append((row, matched))
    # One flush for all newly created grant IDs, regardless of grant count.
    session.flush()
    for grant, (row, matched) in zip(grants, prepared, strict=True):
        changed = _write_vestings(session, row, grant.vestings, matched, events[row.id]) or changed
    for row in existing.values():
        # Explicit children also support test engines without FK enforcement.
        for event in events[row.id]:
            session.delete(event)
    if existing:
        # There is deliberately no lazy ORM relationship. Flush child deletes
        # before parent cascades so SQLAlchemy does not try deleting them twice.
        session.flush()
    for row in existing.values():
        session.delete(row)
        changed = True
    return changed


def update_compensation_preferences(
    session: Session, user_id: int, updates: Mapping[str, Any]
) -> bool:
    """Replace supplied sections, preserve omitted sections, and return changed.

    Accept raw API dictionaries or validated salary models. Invalid fields,
    duplicate IDs and foreign event IDs fail before applying either section.
    An explicit empty object/list clears that section; null is invalid.
    """
    try:
        salary = (
            SalaryStructureConfig.model_validate({"salary_structure": updates["salary_structure"]})
            if "salary_structure" in updates
            else None
        )
        grants = (
            RsuGrantsConfig.model_validate({"rsu_grants": updates["rsu_grants"]})
            if "rsu_grants" in updates
            else None
        )
        if salary is None and grants is None:
            return False
        _expire_clean_compensation(session, {user_id})
        grant_changes = (
            _load_grant_changes(session, user_id, grants.rsu_grants) if grants is not None else None
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    changed = (
        _write_salary(session, user_id, salary.salary_structure) if salary is not None else False
    )
    if grants is not None and grant_changes is not None:
        changed = _write_grants(session, user_id, grants.rsu_grants, grant_changes) or changed
    session.flush()
    return changed


def replace_salary_structure(session: Session, user_id: int, salary_structure: Any) -> bool:
    """Replace this owner's salary section without committing."""
    return update_compensation_preferences(session, user_id, {"salary_structure": salary_structure})


def replace_rsu_grants(session: Session, user_id: int, rsu_grants: Any) -> bool:
    """Replace this owner's RSU section without committing."""
    return update_compensation_preferences(session, user_id, {"rsu_grants": rsu_grants})
