"""Lot ledger, Schedule FA worksheet and FAST-DS 2026 valuation over the user's RSU lots.

A computation aid, not tax advice. All three need market data (the lot ledger
for stock splits), so they authenticate with ``ProviderUser`` (no connection
held), read the user's records in a worker thread with a session of their own,
and only then wait on the quote and rate upstreams. The computation lives in
``core.foreign_assets_reports``.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from starlette.concurrency import run_in_threadpool

from ledger_sync.api.deps import HttpClient, ProviderUser
from ledger_sync.api.rate_limit import user_limiter
from ledger_sync.core.foreign_assets import (
    RsuTaxConflictError,
    RsuTaxNotFoundError,
    RsuTaxRuleError,
)
from ledger_sync.core.foreign_assets_market import load_market
from ledger_sync.core.foreign_assets_records import load_holdings_for
from ledger_sync.core.foreign_assets_reports import (
    fast_ds_report,
    fast_ds_starts,
    ledger_starts,
    lot_ledger,
    schedule_fa_report,
    schedule_period,
    schedule_starts,
)
from ledger_sync.core.ledger_clock import ledger_today
from ledger_sync.schemas.rsu_tax_reports import (
    FastDsResponse,
    LotLedgerResponse,
    ScheduleFaResponse,
)

RSU_TAX_ERRORS = (RsuTaxRuleError, RsuTaxNotFoundError, RsuTaxConflictError)
reports_router = APIRouter()


def http_error(error: Exception) -> HTTPException:
    """404 for a missing record, 409 for a write that lost a race, else 422."""
    status = 422
    if isinstance(error, RsuTaxNotFoundError):
        status = 404
    elif isinstance(error, RsuTaxConflictError):
        status = 409
    return HTTPException(status_code=status, detail=str(error))


@reports_router.get("/lots")
@user_limiter.limit("20/minute")
async def get_lot_ledger(
    request: Request, identity: ProviderUser, client: HttpClient
) -> LotLedgerResponse:
    """One lot per vest that has happened, with the user's sales, dividends and splits."""
    today = ledger_today()
    holdings = await run_in_threadpool(load_holdings_for, identity.id)
    market = await load_market(client, ledger_starts(holdings, today), with_rates=False)
    return lot_ledger(holdings, market, today)


@reports_router.get(
    "/schedule-fa", responses={422: {"description": "The calendar year has not started"}}
)
@user_limiter.limit("20/minute")
async def get_schedule_fa(
    request: Request,
    identity: ProviderUser,
    client: HttpClient,
    year: Annotated[int, Query(ge=2000, le=2100)],
) -> ScheduleFaResponse:
    """Schedule FA (Table A3) rows for every lot held at any time in a calendar year."""
    today = ledger_today()
    try:
        period = schedule_period(year, today)
    except RsuTaxRuleError as error:
        raise http_error(error) from None
    holdings = await run_in_threadpool(load_holdings_for, identity.id)
    market = await load_market(client, schedule_starts(holdings, period, today), with_rates=True)
    return schedule_fa_report(holdings, market, period, today)


@reports_router.get("/fast-ds")
@user_limiter.limit("20/minute")
async def get_fast_ds(
    request: Request, identity: ProviderUser, client: HttpClient
) -> FastDsResponse:
    """Each lot held on 2026-03-31 at the higher of cost and that day's average quote."""
    today = ledger_today()
    holdings = await run_in_threadpool(load_holdings_for, identity.id)
    market = await load_market(client, fast_ds_starts(holdings, today), with_rates=True)
    return fast_ds_report(holdings, market, today)
