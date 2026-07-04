"""Analytics V2 API endpoints -- Enhanced analytics from stored aggregations.

This module provides fast analytics endpoints that read from pre-calculated
aggregation tables rather than computing on-the-fly. All aggregation tables
are scoped to user_id for multi-user safety.

The endpoints are split across submodules for readability; this file is the
thin facade that mounts them.
"""

from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from ledger_sync.api.analytics_v2_impl import (
    networth_misc_router,
    recurring_router,
    spending_rule_router,
    summaries_router,
)
from ledger_sync.api.deps import CurrentUser
from ledger_sync.core.analytics_engine import AnalyticsEngine
from ledger_sync.db.session import SessionLocal

router = APIRouter(prefix="/api/analytics/v2", tags=["analytics-v2"])

# Mount the split sub-routers under the same prefix.
router.include_router(summaries_router)
router.include_router(recurring_router)
router.include_router(spending_rule_router)
router.include_router(networth_misc_router)


@router.post(
    "/refresh",
    responses={500: {"description": "Analytics refresh failed"}},
)
def refresh_analytics(
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Recompute all pre-aggregated analytics tables.

    Called by the frontend after a successful upload to ensure analytics
    are fresh. Uses its own DB session with a relaxed statement timeout
    (analytics runs many heavy computations that can exceed the default
    30 s limit).

    Defined as a sync ``def`` so FastAPI runs it in an external threadpool
    automatically -- avoids event-loop issues under Mangum on Vercel.
    """
    session = SessionLocal()
    try:
        # Relax timeouts for the heavy analytics workload. The per-connection
        # listener in db/session.py sets 30 s / 60 s by default on Postgres,
        # which is too tight for a full recompute. These SETs are Postgres-only
        # syntax -- SQLite has no equivalent, so we skip them for local dev.
        if session.bind is not None and session.bind.dialect.name == "postgresql":
            session.execute(text("SET statement_timeout = '120s'"))
            session.execute(text("SET idle_in_transaction_session_timeout = '300s'"))

        engine = AnalyticsEngine(session, user_id=current_user.id)
        results = engine.run_full_analytics(source_file="manual-refresh")
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Analytics refresh failed: {exc}",
        ) from exc
    finally:
        session.close()
    return {"success": True, "analytics": {k: v for k, v in results.items() if isinstance(v, int)}}
