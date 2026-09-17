"""Transaction-level invalidation and publication for application rollups.

Writers must lock the User row BEFORE reading/mutating ledger or preferences,
then mark changes in that same transaction. ``mark_*`` also takes the lock, but
calling ``lock_analytics_user`` at the start prevents lost read/modify/write
updates. Locks last until the caller commits/rolls back; these helpers never do.

Refresh takes that same lock before loading preferences and transactions and
holds it through the single rollup/publication commit. Thus a waiting refresh
loads the latest committed generation, not a pre-lock snapshot. PostgreSQL uses
READ COMMITTED; serialization failures at stricter isolation must be retried by
the caller. SQLite reserves the writer lock with a no-op User UPDATE.

Readers that combine several rollup queries and freshness metadata can call
``lock_analytics_user`` first and keep one transaction open through all reads.
Uncoordinated multi-statement READ COMMITTED reads can span publications.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ledger_sync.core.ledger_clock import ledger_today, to_ledger_time
from ledger_sync.db.models import AnalyticsState, User

ANALYTICS_ALGORITHM_VERSION = 1
# The dirty set never grows into an unbounded change log.
MAX_DIRTY_DATES = 400


class StaleAnalyticsRefreshError(RuntimeError):
    """The target generation changed, or this worker runs an older algorithm."""


@dataclass(frozen=True)
class AnalyticsVersion:
    ledger: int
    preferences: int
    algorithm: int

    @classmethod
    def from_state(cls, state: AnalyticsState) -> AnalyticsVersion:
        return cls(state.ledger_version, state.preferences_version, state.algorithm_version)


def lock_analytics_user(session: Session, user_id: int, *, read_only: bool = False) -> None:
    """Serialize writes/refreshes; read_only uses shared PostgreSQL reader locks."""
    with session.no_autoflush:
        if session.get_bind().dialect.name == "sqlite":
            locked = session.execute(
                update(User)
                .where(User.id == user_id)
                .values(id=User.id, updated_at=User.updated_at)
                .returning(User.id),
                execution_options={"synchronize_session": False},
            ).scalar_one_or_none()
        else:
            locked = session.execute(
                select(User.id).where(User.id == user_id).with_for_update(read=read_only)
            ).scalar_one_or_none()
    if locked is None:
        raise ValueError(f"Analytics user {user_id} does not exist")


def _locked_state(session: Session, user_id: int) -> AnalyticsState:
    lock_analytics_user(session, user_id)
    # Flush earlier marks in this transaction before refreshing the identity map.
    session.flush()
    state = session.scalar(
        select(AnalyticsState)
        .where(AnalyticsState.user_id == user_id)
        .execution_options(populate_existing=True)
    )
    if state is None:
        state = AnalyticsState(user_id=user_id, algorithm_version=ANALYTICS_ALGORITHM_VERSION)
        session.add(state)
        session.flush()
    return state


def ledger_date_key(value: date | datetime | str) -> str:
    """Normalize a stored IST day, or an offset-aware instant, to an ISO day."""
    if isinstance(value, datetime):
        return to_ledger_time(value).date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return date.fromisoformat(value).isoformat()


def mark_ledger_changed(
    session: Session,
    user_id: int,
    affected_dates: Iterable[date | datetime | str] | None = None,
) -> int:
    """Bump once per actual write batch; include OLD and NEW dates for edits.

    Pass deleted rows' old dates too. ``None`` (unknown scope), an empty iterable,
    or more than MAX_DIRTY_DATES distinct days requests a safe full rebuild.
    Do not call this for an idempotent import with no analytics-relevant changes.
    """
    state = _locked_state(session, user_id)
    state.ledger_version += 1
    if state.full_rebuild_required:
        return state.ledger_version
    dirty = set(json.loads(state.dirty_dates))
    supplied = False
    if affected_dates is not None:
        for value in affected_dates:
            supplied = True
            dirty.add(ledger_date_key(value))
            if len(dirty) > MAX_DIRTY_DATES:
                break
    if not supplied or len(dirty) > MAX_DIRTY_DATES:
        state.full_rebuild_required = True
        state.dirty_dates = "[]"
    else:
        state.dirty_dates = json.dumps(sorted(dirty))
    return state.ledger_version


def mark_preferences_changed(session: Session, user_id: int) -> int:
    """Invalidate all domains after analytics preferences/classifications change."""
    state = _locked_state(session, user_id)
    state.preferences_version += 1
    state.full_rebuild_required = True
    state.dirty_dates = "[]"
    return state.preferences_version


def prepare_refresh(session: Session, user_id: int) -> AnalyticsState:
    """Lock first, then select the current target, upgrading algorithm monotonically."""
    state = _locked_state(session, user_id)
    # _locked_state flushed pending writes. Cached classifications and rollups
    # may predate a wait for this lock, just like preferences and transactions.
    session.expire_all()
    if state.algorithm_version > ANALYTICS_ALGORITHM_VERSION:
        raise StaleAnalyticsRefreshError("A newer analytics algorithm has already been used")
    if state.algorithm_version != ANALYTICS_ALGORITHM_VERSION:
        state.algorithm_version = ANALYTICS_ALGORITHM_VERSION
        state.full_rebuild_required = True
    return state


def analytics_inputs_current(state: AnalyticsState | None) -> bool:
    """Whether all persisted input generations match; missing legacy state is stale."""
    return bool(
        state is not None
        and not state.full_rebuild_required
        and state.ledger_version == state.published_ledger_version
        and state.preferences_version == state.published_preferences_version
        and state.algorithm_version == state.published_algorithm_version
        and state.algorithm_version == ANALYTICS_ALGORITHM_VERSION
    )


def analytics_is_current(state: AnalyticsState | None) -> bool:
    """Include the IST day: budgets, recurring predictions and snapshots use today."""
    return bool(
        analytics_inputs_current(state)
        and state is not None
        and state.published_at is not None
        and to_ledger_time(state.published_at.replace(tzinfo=UTC)).date() == ledger_today()
    )


def get_analytics_state(session: Session, user_id: int) -> AnalyticsState | None:
    """Read metadata without committing; acquire the User lock first for a combined read."""
    return session.scalar(
        select(AnalyticsState)
        .where(AnalyticsState.user_id == user_id)
        .execution_options(populate_existing=True)
    )


def publish_refresh(session: Session, user_id: int, version: AnalyticsVersion) -> None:
    """Publish with rollups in the caller's transaction; reject a superseded target."""
    session.flush()
    published = session.execute(
        update(AnalyticsState)
        .where(
            AnalyticsState.user_id == user_id,
            AnalyticsState.ledger_version == version.ledger,
            AnalyticsState.preferences_version == version.preferences,
            AnalyticsState.algorithm_version == version.algorithm,
        )
        .values(
            published_ledger_version=version.ledger,
            published_preferences_version=version.preferences,
            published_algorithm_version=version.algorithm,
            full_rebuild_required=False,
            dirty_dates="[]",
            published_at=datetime.now(UTC),
        )
        .returning(AnalyticsState.user_id),
        execution_options={"synchronize_session": False},
    ).scalar_one_or_none()
    if published is None:
        raise StaleAnalyticsRefreshError("Analytics inputs changed before publication")
