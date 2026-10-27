"""Weekly recap: a deterministic summary of the last full Monday-to-Sunday IST week.

The figures come from ``core/weekly_recap.py``. The optional AI narrative does
not use this router: the browser sends the recap facts through
``/api/ai/bedrock/chat`` (or the user's own browser-direct key), so it reserves
and counts against the same daily quota as a chat message.
"""

from __future__ import annotations

from fastapi import APIRouter

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.analytics.refresh import lock_analytics_user
from ledger_sync.core.weekly_recap import build_weekly_recap
from ledger_sync.schemas.weekly_recap import WeeklyRecapResponse

router = APIRouter(prefix="/api/weekly-recap", tags=["weekly-recap"])


@router.get("")
def get_weekly_recap(current_user: CurrentUser, db: DatabaseSession) -> WeeklyRecapResponse:
    """Return the recap for the last full IST week, scoped to the signed-in user.

    A sync handler like every ledger read, so FastAPI runs it in the threadpool.
    The shared analytics read lock keeps the rollup reads (anomalies, recurring)
    on the same publication as the ledger sums, as the analytics v2 GETs do.
    """
    lock_analytics_user(db, current_user.id, read_only=True)
    return build_weekly_recap(db, current_user)
