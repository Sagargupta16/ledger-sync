"""Freshness metadata and coherent reads of the published analytics generation."""

from datetime import UTC
from typing import Any

from fastapi import APIRouter, Request

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.analytics.refresh import (
    ANALYTICS_ALGORITHM_VERSION,
    analytics_is_current,
    get_analytics_state,
    lock_analytics_user,
)

router = APIRouter()


def lock_analytics_read(request: Request, current_user: CurrentUser, db: DatabaseSession) -> None:
    """Keep multi-query GETs on one publication; PostgreSQL readers share the lock."""
    if request.method == "GET":
        lock_analytics_user(db, current_user.id, read_only=True)


@router.get("/freshness")
def get_freshness(current_user: CurrentUser, db: DatabaseSession) -> dict[str, Any]:
    """Report the authenticated user's durable input and publication versions."""
    state = get_analytics_state(db, current_user.id)
    if state is None:
        return {
            "status": "uninitialized",
            "is_current": False,
            "current": {
                "ledger_version": 0,
                "preferences_version": 0,
                "algorithm_version": ANALYTICS_ALGORITHM_VERSION,
            },
            "published": None,
            "published_at": None,
            "full_rebuild_required": True,
        }
    current = analytics_is_current(state)
    return {
        "status": "current" if current else "stale",
        "is_current": current,
        "current": {
            "ledger_version": state.ledger_version,
            "preferences_version": state.preferences_version,
            "algorithm_version": max(state.algorithm_version, ANALYTICS_ALGORITHM_VERSION),
        },
        "published": (
            {
                "ledger_version": state.published_ledger_version,
                "preferences_version": state.published_preferences_version,
                "algorithm_version": state.published_algorithm_version,
            }
            if state.published_at is not None
            else None
        ),
        "published_at": (
            state.published_at.replace(tzinfo=UTC).isoformat() if state.published_at else None
        ),
        "full_rebuild_required": (
            state.full_rebuild_required or state.algorithm_version != ANALYTICS_ALGORITHM_VERSION
        ),
    }
