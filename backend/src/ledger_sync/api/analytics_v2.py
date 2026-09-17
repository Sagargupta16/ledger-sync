"""Analytics V2 API endpoints -- Enhanced analytics from stored aggregations.

This module provides fast analytics endpoints that read from pre-calculated
aggregation tables rather than computing on-the-fly. All aggregation tables
are scoped to user_id for multi-user safety.

The endpoints are split across submodules for readability; this file is the
thin facade that mounts them.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from ledger_sync.api.analytics_freshness import lock_analytics_read
from ledger_sync.api.analytics_freshness import router as freshness_router
from ledger_sync.api.analytics_v2_impl import (
    networth_misc_router,
    recurring_router,
    spending_rule_router,
    summaries_router,
)
from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.analytics_engine import AnalyticsEngine
from ledger_sync.utils.logging import logger

router = APIRouter(prefix="/api/analytics/v2", tags=["analytics-v2"])

# Mount the split sub-routers under the same prefix.
router.include_router(summaries_router, dependencies=[Depends(lock_analytics_read)])
router.include_router(recurring_router, dependencies=[Depends(lock_analytics_read)])
router.include_router(spending_rule_router, dependencies=[Depends(lock_analytics_read)])
router.include_router(networth_misc_router, dependencies=[Depends(lock_analytics_read)])
router.include_router(freshness_router, dependencies=[Depends(lock_analytics_read)])


@router.post(
    "/refresh",
    responses={500: {"description": "Analytics refresh failed"}},
)
def refresh_analytics(
    current_user: CurrentUser,
    db: DatabaseSession,
    force_full: bool = False,
) -> dict[str, Any]:
    """Refresh invalidated analytics; force_full also repairs current rollups.

    Called by the frontend after a successful upload to ensure analytics
    are fresh. Reuses authentication's request session so one refresh needs
    only one pooled connection. The engine commits its publication; request
    cleanup owns session closure.

    Defined as a sync ``def`` so FastAPI runs it in an external threadpool
    automatically -- avoids event-loop issues under Mangum on Vercel.
    """
    # Capture before the engine commits or rollback expires the ORM user.
    user_id = current_user.id
    try:
        # Override defaults only for this transaction, including constructor
        # reads. Commit/rollback restores the connection's normal timeouts.
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            db.execute(text("SET LOCAL statement_timeout = '120s'"))
            db.execute(text("SET LOCAL idle_in_transaction_session_timeout = '300s'"))

        engine = AnalyticsEngine(db, user_id=user_id)
        results = (
            engine.run_full_analytics(source_file="manual-refresh")
            if force_full
            else engine.refresh_analytics(source_file="manual-refresh")
        )
    except Exception as exc:
        db.rollback()
        logger.warning("Analytics refresh failed for user_id=%s (%s)", user_id, type(exc).__name__)
        raise HTTPException(
            status_code=500,
            detail="Analytics refresh failed. Please try again.",
        ) from exc
    return {"success": True, "analytics": {k: v for k, v in results.items() if isinstance(v, int)}}
