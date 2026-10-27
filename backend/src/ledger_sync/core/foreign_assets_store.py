"""Write a user's RSU conversion records and foreign-asset events.

A computation aid for an Indian return, not tax advice. Every function scopes
by ``user_id`` and raises the ``RsuTax*Error`` types from ``foreign_assets``;
the router maps them to HTTP statuses. Sale quantities are not capped at the
vest's gross units: a sale after a split is entered on the new share count, so
an oversold lot is flagged in the lot ledger instead.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ledger_sync.core.foreign_assets import (
    RsuTaxConflictError,
    RsuTaxNotFoundError,
    RsuTaxRuleError,
    derive_fx_source,
    rate_card_date,
    require_past,
    require_sale_after_vest,
    same_stock,
)
from ledger_sync.core.foreign_assets_records import owned_vesting
from ledger_sync.db.models import ForeignAssetEvent, RsuGrantRecord, RsuVestFx
from ledger_sync.schemas.rsu_tax import (
    ForeignAssetEventCreate,
    ForeignAssetEventLink,
    VestFxUpsert,
)


def list_vest_fx(session: Session, user_id: int) -> list[RsuVestFx]:
    return list(
        session.scalars(
            select(RsuVestFx).where(RsuVestFx.user_id == user_id).order_by(RsuVestFx.id)
        )
    )


def _vest_fx(session: Session, user_id: int, vesting_id: str) -> RsuVestFx | None:
    return session.scalars(
        select(RsuVestFx).where(RsuVestFx.vesting_id == vesting_id, RsuVestFx.user_id == user_id)
    ).one_or_none()


def _assign(record: RsuVestFx, values: Mapping[str, object]) -> None:
    for name, value in values.items():
        setattr(record, name, value)


def _insert_vest_fx(
    session: Session, user_id: int, vesting_id: str, values: Mapping[str, object]
) -> RsuVestFx:
    record = RsuVestFx(user_id=user_id, vesting_id=vesting_id, **values)
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def save_vest_fx(
    session: Session, user_id: int, vesting_id: str, payload: VestFxUpsert, today: date
) -> RsuVestFx:
    """Create or replace one vest's conversion. The source follows from what is entered."""
    vesting, _ = owned_vesting(session, user_id, vesting_id)
    require_past(vesting.date, today, "Record the conversion once the vest date has passed.")
    values = {
        "fx_source": derive_fx_source(payload.employer_perquisite_inr, payload.fx_rate),
        "fx_rate": payload.fx_rate,
        "fx_date": rate_card_date(vesting.date, payload.fx_rate, payload.fx_date, today),
        "quote_price": payload.quote_price,
        "quote_currency": payload.quote_currency,
        "employer_perquisite_inr": payload.employer_perquisite_inr,
    }
    record = _vest_fx(session, user_id, vesting_id)
    if record is None:
        try:
            return _insert_vest_fx(session, user_id, vesting_id, values)
        except IntegrityError:
            # A concurrent save won the unique vest key, or the vest just went away.
            session.rollback()
        record = _vest_fx(session, user_id, vesting_id)
        if record is None:
            raise RsuTaxConflictError("The vest changed while saving. Reload and retry.")
    _assign(record, values)
    session.commit()
    session.refresh(record)
    return record


def delete_vest_fx(session: Session, user_id: int, vesting_id: str) -> None:
    """Go back to the ECB approximation. Idempotent."""
    record = _vest_fx(session, user_id, vesting_id)
    if record is not None:
        session.delete(record)
        session.commit()


def grant_symbol(session: Session, user_id: int, symbol: str) -> str:
    """The user's own grant stock name matching ``symbol``, ignoring case."""
    names = session.scalars(
        select(RsuGrantRecord.stock_name).where(RsuGrantRecord.user_id == user_id)
    )
    for name in names:
        if same_stock(name, symbol):
            return name.strip()
    raise RsuTaxRuleError("No RSU grant uses that stock. Pick one of your grants' stocks.")


def _sale_lot(session: Session, user_id: int, lot_id: str, sale_day: date) -> tuple[str, str]:
    vesting, stock_name = owned_vesting(session, user_id, lot_id)
    require_sale_after_vest(sale_day, vesting.date)
    return vesting.id, stock_name


def _note(notes: str | None) -> str | None:
    return notes.strip() if notes and notes.strip() else None


def create_event(
    session: Session, user_id: int, payload: ForeignAssetEventCreate, today: date
) -> ForeignAssetEvent:
    """Record a sale from one vest, or a dividend on one of the user's stocks."""
    require_past(payload.event_date, today, "The date cannot be in the future.")
    is_sale = payload.kind == "sale"
    if is_sale:
        lot_id, symbol = _sale_lot(session, user_id, payload.lot_id or "", payload.event_date)
    else:
        lot_id, symbol = None, grant_symbol(session, user_id, payload.symbol or "")
    event = ForeignAssetEvent(
        user_id=user_id,
        kind=payload.kind,
        vesting_id=lot_id,
        symbol=symbol,
        event_date=payload.event_date,
        quantity=payload.quantity if is_sale else None,
        gross_amount=payload.gross_amount,
        tax_withheld=None if is_sale else payload.tax_withheld,
        fx_rate=payload.fx_rate,
        fx_date=rate_card_date(payload.event_date, payload.fx_rate, payload.fx_date, today),
        notes=_note(payload.notes),
    )
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


def _event(session: Session, user_id: int, event_id: int) -> ForeignAssetEvent | None:
    return session.scalars(
        select(ForeignAssetEvent).where(
            ForeignAssetEvent.id == event_id, ForeignAssetEvent.user_id == user_id
        )
    ).one_or_none()


def link_event(
    session: Session, user_id: int, event_id: int, link: ForeignAssetEventLink
) -> ForeignAssetEvent:
    """Point a sale at the vest it came from, or a dividend at the stock that paid it."""
    event = _event(session, user_id, event_id)
    if event is None:
        raise RsuTaxNotFoundError("No such sale or dividend.")
    if event.kind == "sale":
        if link.lot_id is None:
            raise RsuTaxRuleError("Pick the vest this sale came from.")
        event.vesting_id, event.symbol = _sale_lot(session, user_id, link.lot_id, event.event_date)
    else:
        if link.symbol is None:
            raise RsuTaxRuleError("Pick the stock that paid this dividend.")
        event.symbol = grant_symbol(session, user_id, link.symbol)
    session.commit()
    session.refresh(event)
    return event


def delete_event(session: Session, user_id: int, event_id: int) -> None:
    """Remove one sale or dividend. Idempotent."""
    event = _event(session, user_id, event_id)
    if event is not None:
        session.delete(event)
        session.commit()
