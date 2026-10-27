"""Dashboard metrics: the few figures the Dashboard used to derive from the whole ledger.

Routes only; the computation is ``core/dashboard_metrics.py``. Both reads are
user-scoped and return a few hundred bytes where the Dashboard used to fetch
``/api/transactions/all``. Each one reads the ledger, the account balances and
the classifications in several queries, so it takes the shared analytics read
lock first, as the analytics v2 GETs do, to keep them on one publication.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.api.transactions_impl.filters import END_DATE_DESC, START_DATE_DESC
from ledger_sync.core.analytics.refresh import lock_analytics_user
from ledger_sync.core.dashboard_metrics import dashboard_health, dashboard_pulse
from ledger_sync.core.ledger_clock import ledger_today
from ledger_sync.schemas.dashboard_metrics import DashboardHealthResponse, DashboardPulseResponse

router = APIRouter(prefix="/api/dashboard-metrics", tags=["dashboard-metrics"])


@router.get("/pulse")
def get_dashboard_pulse(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: Annotated[datetime | None, Query(description=START_DATE_DESC)] = None,
    end_date: Annotated[datetime | None, Query(description=END_DATE_DESC)] = None,
) -> DashboardPulseResponse:
    """Age of Money, Days of Buffering and the investment-transfer split for a window.

    Computed over the rows ``/api/transactions/all`` returns for the same
    window. Days of Buffering divides today's net spendable balance by the mean
    daily spend of the window's rows in the 90 days to today, so a past window
    reads null.
    """
    lock_analytics_user(db, current_user.id, read_only=True)
    pulse = dashboard_pulse(db, current_user, start_date, end_date, ledger_today())
    return DashboardPulseResponse.model_validate(pulse)


@router.get("/health")
def get_dashboard_health(current_user: CurrentUser, db: DatabaseSession) -> DashboardHealthResponse:
    """The current financial health analysis the FinHealth and CFP scores read.

    Trailing 24 completed months bounded by the employment start, with lifetime
    balances. ``current_health`` is null below 10 rows or 3 completed months.
    """
    lock_analytics_user(db, current_user.id, read_only=True)
    health = dashboard_health(db, current_user, ledger_today())
    return DashboardHealthResponse.model_validate(health)
