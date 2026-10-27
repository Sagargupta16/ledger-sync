"""Response shapes for /api/rsu-tax: stored records and report rows to API models.

Decimals stay exact until here. Report rupee figures leave as whole rupees, the
rest as JSON numbers.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date
from decimal import Decimal

from ledger_sync.core.foreign_assets import conversion_rule, paisa, specified_date
from ledger_sync.core.foreign_assets_fast_ds import FastDsRow
from ledger_sync.core.foreign_assets_lots import Lot
from ledger_sync.core.foreign_assets_market import MarketData
from ledger_sync.core.foreign_assets_quotes import quote_on_or_before, split_factor
from ledger_sync.core.foreign_assets_records import EventRecord
from ledger_sync.core.foreign_assets_schedule import ScheduleFaRow
from ledger_sync.core.foreign_assets_upstream import SymbolHistory
from ledger_sync.db.models import RsuVestFx
from ledger_sync.schemas.rsu_tax import (
    EventIssue,
    ForeignAssetEventResponse,
    VestCloseResponse,
    VestFxResponse,
)
from ledger_sync.schemas.rsu_tax_reports import (
    FastDsRowResponse,
    LotResponse,
    ScheduleFaRowResponse,
    ScheduleFaTotals,
    SplitResponse,
)

_ZERO = Decimal(0)
_PRICE_STEP = Decimal("0.0001")


def _rounded(value: Decimal | None) -> Decimal | None:
    return None if value is None else paisa(value)


def _whole(value: Decimal | None) -> int | None:
    return None if value is None else int(value)


def vest_fx_response(record: RsuVestFx) -> VestFxResponse:
    return VestFxResponse.model_validate(
        {
            "vesting_id": record.vesting_id,
            "fx_source": record.fx_source,
            "fx_rate": record.fx_rate,
            "fx_date": record.fx_date,
            "quote_price": record.quote_price,
            "quote_currency": record.quote_currency,
            "employer_perquisite_inr": record.employer_perquisite_inr,
            "updated_at": record.updated_at,
        }
    )


def vest_close(history: SymbolHistory | None, symbol: str, day: date) -> VestCloseResponse | None:
    """The close on or just before ``day`` on that day's share count, not today's."""
    quote = None if history is None else quote_on_or_before(history.quotes, day)
    if history is None or quote is None:
        return None
    factor = split_factor(history.splits, quote.day)
    return VestCloseResponse(
        symbol=symbol,
        currency=history.currency,
        price=float((quote.close * factor).quantize(_PRICE_STEP)),
        as_of=quote.day,
        adjusted_price=float(quote.close),
        split_factor=float(factor),
    )


def event_response(
    event: EventRecord, *, currency: str | None = None, issue: EventIssue | None = None
) -> ForeignAssetEventResponse:
    amount = None if event.fx_rate is None else event.gross_amount * event.fx_rate
    return ForeignAssetEventResponse.model_validate(
        {
            "id": event.id,
            "kind": event.kind,
            "lot_id": event.lot_id,
            "symbol": event.symbol,
            "event_date": event.day,
            "quantity": event.quantity,
            "gross_amount": event.gross_amount,
            "tax_withheld": event.tax_withheld,
            "currency": currency,
            "fx_rate": event.fx_rate,
            "fx_date": event.fx_date,
            "amount_inr": _rounded(amount),
            "notes": event.notes,
            "issue": issue,
        }
    )


def lot_response(lot: Lot, currency: str | None) -> LotResponse:
    value, factor = lot.value, lot.current_factor
    remaining = max(_ZERO, lot.held_quantity - lot.sold_vest_shares)
    return LotResponse.model_validate(
        {
            "lot_id": lot.lot_id,
            "grant_id": lot.vest.grant_id,
            "symbol": lot.vest.symbol,
            "currency": currency,
            "acquired_on": lot.acquired_on,
            "gross_quantity": lot.vest.gross_quantity,
            "held_quantity": lot.held_quantity,
            "quantity_estimated": lot.quantity_estimated,
            "sold_quantity": lot.sold_vest_shares * factor,
            "remaining_quantity": remaining * factor,
            "split_factor": factor,
            "splits": [SplitResponse(ex_date=split.day, ratio=split.label) for split in lot.splits],
            "fx_source": value.source,
            "tax_value_inr": _rounded(value.tax_value_inr),
            "ecb_value_inr": _rounded(value.ecb_value_inr),
            "difference_inr": _rounded(value.difference_inr),
            "cost_per_share_inr": _rounded(lot.cost_per_share_inr),
            "initial_value_inr": _rounded(lot.cost_inr(lot.held_quantity)),
            "conversion_rule": conversion_rule(lot.acquired_on),
            "specified_date": specified_date(lot.acquired_on),
            "flags": list(lot.flags),
        }
    )


def fa_row(row: ScheduleFaRow, market: MarketData) -> ScheduleFaRowResponse:
    symbol = row.lot.vest.symbol
    currency = market.currency(symbol)
    return ScheduleFaRowResponse.model_validate(
        {
            "lot_id": row.lot.lot_id,
            "symbol": symbol,
            "entity_name": market.name(symbol),
            "country": "United States of America" if currency == "USD" else "Outside India",
            "nature": "Company",
            "currency": currency,
            "acquired_on": row.lot.acquired_on,
            "shares_at_start": row.shares_at_start,
            "shares_at_end": row.shares_at_end,
            "fx_source": row.lot.value.source,
            "initial_value_inr": _whole(row.initial_value_inr),
            "peak_value_inr": _whole(row.peak_value_inr),
            "peak_value_quote": row.peak_value_quote,
            "peak_date": row.peak_date,
            "peak_rate": row.peak_rate,
            "closing_value_inr": _whole(row.closing_value_inr),
            "closing_value_quote": row.closing_value_quote,
            "closing_price_date": row.closing_price_date,
            "closing_rate": row.closing_rate,
            "dividends_inr": int(row.dividends_inr),
            "dividends_quote": paisa(row.dividends_quote),
            "tax_withheld_inr": int(row.tax_withheld_inr),
            "tax_withheld_quote": paisa(row.tax_withheld_quote),
            "sale_proceeds_inr": int(row.sale_proceeds_inr),
            "sale_proceeds_quote": paisa(row.sale_proceeds_quote),
            "flags": row.flags,
        }
    )


def fa_totals(rows: Sequence[ScheduleFaRowResponse]) -> ScheduleFaTotals:
    return ScheduleFaTotals(
        initial_value_inr=sum(row.initial_value_inr or 0 for row in rows),
        closing_value_inr=sum(row.closing_value_inr or 0 for row in rows),
        dividends_inr=sum(row.dividends_inr for row in rows),
        tax_withheld_inr=sum(row.tax_withheld_inr for row in rows),
        sale_proceeds_inr=sum(row.sale_proceeds_inr for row in rows),
    )


def ds_row(row: FastDsRow, currency: str, rate: tuple[date, Decimal] | None) -> FastDsRowResponse:
    return FastDsRowResponse.model_validate(
        {
            "lot_id": row.lot.lot_id,
            "symbol": row.lot.vest.symbol,
            "currency": currency,
            "acquired_on": row.lot.acquired_on,
            "shares": row.shares,
            "cost_inr": _whole(row.cost_inr),
            "quote_date": row.quote_date,
            "average_quote": row.average_quote,
            "market_value_quote": row.market_value_quote,
            "rate": None if rate is None else rate[1],
            "rate_date": None if rate is None else rate[0],
            "market_value_inr": _whole(row.market_value_inr),
            "value_inr": _whole(row.value_inr),
            "basis": row.basis,
            "flags": list(row.lot.flags),
        }
    )
