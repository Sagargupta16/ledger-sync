"""RSU tax records: how each vest becomes rupees, and sales and dividends of the shares.

A computation aid for an Indian return, not tax advice. ``/vest-fx`` records a
vest's conversion: the employer's perquisite figure governs when entered, else
the SBI TT buying rate the user looked up for the last day of the month before
the vest month, else the app's ECB-converted vest price (an approximation).
``/vest-close`` reads the real vest-date close for that rate's price.
``/events`` records sales (from one vest) and dividends (per stock, with the
US tax withheld). The lot ledger, Schedule FA and FAST-DS reports are mounted
from ``rsu_tax_reports``. The rules live in ``core.foreign_assets*``; these
routes only map their errors to HTTP statuses. Nothing here is an analytics input.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Path, Request
from starlette.concurrency import run_in_threadpool

from ledger_sync.api.deps import CurrentUser, DatabaseSession, HttpClient, ProviderUser
from ledger_sync.api.rate_limit import user_limiter
from ledger_sync.api.rsu_tax_reports import RSU_TAX_ERRORS, http_error, reports_router
from ledger_sync.core import foreign_assets_store as store
from ledger_sync.core.foreign_assets import require_past
from ledger_sync.core.foreign_assets_market import load_history
from ledger_sync.core.foreign_assets_records import event_record, load_vest_for
from ledger_sync.core.foreign_assets_responses import event_response, vest_close, vest_fx_response
from ledger_sync.core.ledger_clock import ledger_today
from ledger_sync.schemas.rsu_tax import (
    ForeignAssetEventCreate,
    ForeignAssetEventLink,
    ForeignAssetEventResponse,
    VestCloseResponse,
    VestFxResponse,
    VestFxUpsert,
)

router = APIRouter(prefix="/api/rsu-tax", tags=["rsu-tax"])
VestingId = Annotated[str, Path(min_length=1, max_length=64)]
_ERRORS: dict[int | str, dict[str, Any]] = {
    404: {"description": "No such vest or record for this user"},
    409: {"description": "The record changed while saving"},
    422: {"description": "The values do not fit the vest or the dates"},
}


@router.get("/vest-fx")
def list_vest_fx(current_user: CurrentUser, db: DatabaseSession) -> list[VestFxResponse]:
    """Every conversion record the user has entered, by vest."""
    return [vest_fx_response(row) for row in store.list_vest_fx(db, current_user.id)]


@router.put("/vest-fx/{vesting_id}", responses=_ERRORS)
def save_vest_fx(
    vesting_id: VestingId, payload: VestFxUpsert, current_user: CurrentUser, db: DatabaseSession
) -> VestFxResponse:
    """Create or replace one vest's conversion. The source follows from what is entered."""
    try:
        record = store.save_vest_fx(db, current_user.id, vesting_id, payload, ledger_today())
    except RSU_TAX_ERRORS as error:
        raise http_error(error) from None
    return vest_fx_response(record)


@router.delete("/vest-fx/{vesting_id}", status_code=204)
def delete_vest_fx(vesting_id: VestingId, current_user: CurrentUser, db: DatabaseSession) -> None:
    """Go back to the ECB approximation. Idempotent."""
    store.delete_vest_fx(db, current_user.id, vesting_id)


@router.get(
    "/vest-close/{vesting_id}",
    responses={**_ERRORS, 502: {"description": "No close could be loaded for the vest date"}},
)
@user_limiter.limit("20/minute")
async def get_vest_close(
    vesting_id: VestingId, request: Request, identity: ProviderUser, client: HttpClient
) -> VestCloseResponse:
    """The vest-date close in the stock's currency, before any later split."""
    try:
        symbol, vest_day = await run_in_threadpool(load_vest_for, identity.id, vesting_id)
        require_past(vest_day, ledger_today(), "The vest date has not passed yet.")
    except RSU_TAX_ERRORS as error:
        raise http_error(error) from None
    close = vest_close(await load_history(client, symbol, vest_day), symbol, vest_day)
    if close is None:
        raise HTTPException(
            status_code=502,
            detail="The vest-date close could not be loaded. Enter the vest confirmation's price.",
        )
    return close


@router.post("/events", status_code=201, responses=_ERRORS)
def create_event(
    payload: ForeignAssetEventCreate, current_user: CurrentUser, db: DatabaseSession
) -> ForeignAssetEventResponse:
    """Record a sale from one vest, or a dividend on one of the user's stocks."""
    try:
        event = store.create_event(db, current_user.id, payload, ledger_today())
    except RSU_TAX_ERRORS as error:
        raise http_error(error) from None
    return event_response(event_record(event))


@router.patch("/events/{event_id}", responses=_ERRORS)
def link_event(
    event_id: int, payload: ForeignAssetEventLink, current_user: CurrentUser, db: DatabaseSession
) -> ForeignAssetEventResponse:
    """Point a sale at the vest it came from, or a dividend at the stock that paid it."""
    try:
        event = store.link_event(db, current_user.id, event_id, payload)
    except RSU_TAX_ERRORS as error:
        raise http_error(error) from None
    return event_response(event_record(event))


@router.delete("/events/{event_id}", status_code=204)
def delete_event(event_id: int, current_user: CurrentUser, db: DatabaseSession) -> None:
    """Remove one sale or dividend. Idempotent."""
    store.delete_event(db, current_user.id, event_id)


router.include_router(reports_router)
