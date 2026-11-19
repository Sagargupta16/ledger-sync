"""Finish the analytics refreshes owed to users, without anyone asking for them.

An upload or backup import saves the ledger first and refreshes insights after;
if that refresh fails or times out the user's inputs stay uncurrent. The daily
cron calls ``refresh_due_users`` to settle them. Only the selection of ids reads
across users; each refresh runs in its own session and is user-scoped.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ledger_sync.core.analytics.engine import AnalyticsEngine
from ledger_sync.core.analytics.refresh import ANALYTICS_ALGORITHM_VERSION
from ledger_sync.core.analytics.refresh_budget import apply_refresh_budget
from ledger_sync.core.observability import report_exception
from ledger_sync.db.models import AnalyticsState, User
from ledger_sync.utils.logging import logger


@dataclass(frozen=True)
class DrainReport:
    due: int
    refreshed: int
    failed: int
    deferred: int


def _due_user_ids(session: Session, limit: int) -> list[int]:
    """Users whose inputs are not current (the SQL form of ``analytics_inputs_current``)."""
    stmt = (
        select(User.id)
        .outerjoin(AnalyticsState, AnalyticsState.user_id == User.id)
        .where(
            User.is_active.is_(True),
            or_(
                AnalyticsState.user_id.is_(None),
                AnalyticsState.full_rebuild_required.is_(True),
                AnalyticsState.ledger_version != AnalyticsState.published_ledger_version,
                AnalyticsState.preferences_version != AnalyticsState.published_preferences_version,
                AnalyticsState.algorithm_version != AnalyticsState.published_algorithm_version,
                AnalyticsState.algorithm_version != ANALYTICS_ALGORITHM_VERSION,
            ),
        )
        .order_by(AnalyticsState.published_at.asc().nulls_first(), User.id)
        .limit(limit)
    )
    return list(session.scalars(stmt))


def refresh_due_users(
    session_factory: Callable[[], Session],
    *,
    limit: int = 25,
    # 150 s plus one refresh's 120 s statement budget still ends inside Vercel's 300 s.
    deadline_seconds: float = 150.0,
) -> DrainReport:
    """Refresh up to ``limit`` users with owed inputs, oldest publication first."""
    started = time.monotonic()
    with session_factory() as session:
        user_ids = _due_user_ids(session, limit)
    refreshed = failed = deferred = 0
    for position, uid in enumerate(user_ids):
        if time.monotonic() - started >= deadline_seconds:
            deferred = len(user_ids) - position
            break
        with session_factory() as db:
            try:
                apply_refresh_budget(db)
                AnalyticsEngine(db, user_id=uid).refresh_analytics(source_file="scheduled-drain")
                db.commit()
                refreshed += 1
            except Exception as exc:
                db.rollback()
                failed += 1
                logger.warning(
                    "Scheduled analytics refresh failed for user_id=%s (%s)",
                    uid,
                    type(exc).__name__,
                )
                report_exception(exc)
    return DrainReport(due=len(user_ids), refreshed=refreshed, failed=failed, deferred=deferred)
