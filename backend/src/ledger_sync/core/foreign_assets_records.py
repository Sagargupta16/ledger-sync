"""Read a user's RSU vests, conversions and foreign-asset events as plain records.

``load_holdings`` turns ORM rows into dataclasses, so no ORM object outlives the
session that read it: the reports read in a worker thread, then wait on market
data with no session open. Every query filters by ``user_id``. Stock names
become upper-case tickers here, the key every report groups by.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.core.foreign_assets import (
    DividendRecord,
    RsuTaxNotFoundError,
    SaleRecord,
    VestFxRecord,
    VestRecord,
)
from ledger_sync.db import session as db_session
from ledger_sync.db.models import (
    ForeignAssetEvent,
    RsuGrantRecord,
    RsuVestFx,
    RsuVestingRecord,
    UserPreferences,
)

_ZERO = Decimal(0)


@dataclass(frozen=True, slots=True)
class EventRecord:
    id: int
    kind: str
    lot_id: str | None
    symbol: str
    day: date
    quantity: Decimal | None
    gross_amount: Decimal
    tax_withheld: Decimal | None
    fx_rate: Decimal | None
    fx_date: date | None
    notes: str | None


def event_record(event: ForeignAssetEvent) -> EventRecord:
    return EventRecord(
        id=event.id,
        kind=event.kind,
        lot_id=event.vesting_id,
        symbol=event.symbol.strip().upper(),
        day=event.event_date,
        quantity=event.quantity,
        gross_amount=event.gross_amount,
        tax_withheld=event.tax_withheld,
        fx_rate=event.fx_rate,
        fx_date=event.fx_date,
        notes=event.notes,
    )


@dataclass(frozen=True, slots=True)
class Holdings:
    vests: list[VestRecord]
    fx: dict[str, VestFxRecord]
    events: list[EventRecord]
    # False when the display currency is not INR, so saved vest prices are not rupees.
    prices_in_inr: bool

    @property
    def sales(self) -> list[SaleRecord]:
        return [
            SaleRecord(e.id, e.lot_id, e.symbol, e.day, e.quantity, e.gross_amount, e.fx_rate)
            for e in self.events
            if e.kind == "sale" and e.quantity is not None
        ]

    @property
    def dividends(self) -> list[DividendRecord]:
        return [
            DividendRecord(
                e.id, e.symbol, e.day, e.gross_amount, e.tax_withheld or _ZERO, e.fx_rate
            )
            for e in self.events
            if e.kind == "dividend"
        ]

    def first_vests(self, until: date) -> dict[str, date]:
        """Each stock's earliest vest on or before ``until``: where its price history starts."""
        first: dict[str, date] = {}
        for vest in self.vests:
            if vest.vest_date <= until and vest.vest_date < first.get(vest.symbol, date.max):
                first[vest.symbol] = vest.vest_date
        return first


def owned_vesting(session: Session, user_id: int, vesting_id: str) -> tuple[RsuVestingRecord, str]:
    """The user's own vest and its grant's stock name."""
    row = session.execute(
        select(RsuVestingRecord, RsuGrantRecord.stock_name)
        .join(
            RsuGrantRecord,
            (RsuGrantRecord.id == RsuVestingRecord.grant_id)
            & (RsuGrantRecord.user_id == RsuVestingRecord.user_id),
        )
        .where(RsuVestingRecord.id == vesting_id, RsuVestingRecord.user_id == user_id)
    ).one_or_none()
    if row is None:
        raise RsuTaxNotFoundError("Vest not found. Save the grant in Settings.")
    return row[0], row[1].strip()


def load_holdings(session: Session, user_id: int) -> Holdings:
    grants = {
        row.id: (row.public_id, row.stock_name.strip().upper())
        for row in session.execute(
            select(RsuGrantRecord.id, RsuGrantRecord.public_id, RsuGrantRecord.stock_name).where(
                RsuGrantRecord.user_id == user_id
            )
        )
    }
    vests = [
        VestRecord(
            vesting_id=row.id,
            grant_id=grants[row.grant_id][0],
            symbol=grants[row.grant_id][1],
            vest_date=row.date,
            gross_quantity=Decimal(row.quantity),
            net_quantity=row.net_quantity,
            price_at_vest=row.price_at_vest,
        )
        for row in session.scalars(
            select(RsuVestingRecord).where(RsuVestingRecord.user_id == user_id)
        )
        if row.grant_id in grants
    ]
    fx = {
        row.vesting_id: VestFxRecord(
            fx_source=row.fx_source,
            fx_rate=row.fx_rate,
            fx_date=row.fx_date,
            quote_price=row.quote_price,
            quote_currency=row.quote_currency,
            employer_perquisite_inr=row.employer_perquisite_inr,
        )
        for row in session.scalars(select(RsuVestFx).where(RsuVestFx.user_id == user_id))
    }
    events = [
        event_record(row)
        for row in session.scalars(
            select(ForeignAssetEvent)
            .where(ForeignAssetEvent.user_id == user_id)
            .order_by(ForeignAssetEvent.event_date, ForeignAssetEvent.id)
        )
    ]
    display = session.scalar(
        select(UserPreferences.display_currency).where(UserPreferences.user_id == user_id)
    )
    return Holdings(vests, fx, events, prices_in_inr=(display or "INR") == "INR")


def load_holdings_for(user_id: int) -> Holdings:
    """A complete worker phase: its own session, closed before any provider call."""
    with db_session.SessionLocal() as session:
        return load_holdings(session, user_id)


def load_vest_for(user_id: int, vesting_id: str) -> tuple[str, date]:
    """The vest's ticker and date, in a worker phase of its own."""
    with db_session.SessionLocal() as session:
        vesting, stock_name = owned_vesting(session, user_id, vesting_id)
        return stock_name.upper(), vesting.date
