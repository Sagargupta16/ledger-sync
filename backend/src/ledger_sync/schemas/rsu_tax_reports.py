"""Response models for the /api/rsu-tax reports: lot ledger, Schedule FA and FAST-DS.

Rupee figures in Schedule FA and FAST-DS rows are whole rupees, as the forms
take them. Every figure is a computation aid for a return, not tax advice.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel

from ledger_sync.schemas.rsu_tax import ForeignAssetEventResponse, FxSource


class SplitResponse(BaseModel):
    ex_date: date
    ratio: str


class LotResponse(BaseModel):
    lot_id: str
    grant_id: str
    symbol: str
    currency: str | None
    acquired_on: date
    # Counts at the vest: the gross vest and the units received after tax.
    gross_quantity: float
    held_quantity: float
    quantity_estimated: bool
    # Counts on today's share count, after the splits since the vest.
    sold_quantity: float
    remaining_quantity: float
    split_factor: float
    splits: list[SplitResponse]
    fx_source: FxSource
    tax_value_inr: float | None
    ecb_value_inr: float | None
    difference_inr: float | None
    # Per share at the vest.
    cost_per_share_inr: float | None
    initial_value_inr: float | None
    conversion_rule: str
    specified_date: date
    flags: list[str]


class LotLedgerResponse(BaseModel):
    lots: list[LotResponse]
    events: list[ForeignAssetEventResponse]
    symbols: list[str]
    first_year: int | None
    current_year: int
    warnings: list[str]


class ScheduleFaRowResponse(BaseModel):
    lot_id: str
    symbol: str
    entity_name: str
    country: str
    nature: str
    currency: str
    acquired_on: date
    shares_at_start: float
    shares_at_end: float
    fx_source: FxSource
    initial_value_inr: int | None
    peak_value_inr: int | None
    peak_value_quote: float | None
    peak_date: date | None
    peak_rate: float | None
    closing_value_inr: int | None
    closing_value_quote: float | None
    closing_price_date: date | None
    closing_rate: float | None
    dividends_inr: int
    dividends_quote: float
    tax_withheld_inr: int
    tax_withheld_quote: float
    sale_proceeds_inr: int
    sale_proceeds_quote: float
    flags: list[str]


class ScheduleFaTotals(BaseModel):
    initial_value_inr: int
    closing_value_inr: int
    dividends_inr: int
    tax_withheld_inr: int
    sale_proceeds_inr: int


class ScheduleFaResponse(BaseModel):
    calendar_year: int
    period_start: date
    period_end: date
    in_progress: bool
    return_label: str
    rate_basis: str
    rows: list[ScheduleFaRowResponse]
    totals: ScheduleFaTotals
    warnings: list[str]


class FastDsRowResponse(BaseModel):
    lot_id: str
    symbol: str
    currency: str
    acquired_on: date
    shares: float
    cost_inr: int | None
    quote_date: date | None
    average_quote: float | None
    market_value_quote: float | None
    rate: float | None
    rate_date: date | None
    market_value_inr: int | None
    value_inr: int | None
    basis: Literal["cost", "market"] | None
    flags: list[str]


class FastDsResponse(BaseModel):
    valuation_date: date
    deadline: date
    # Zero on the deadline day itself, negative once it has passed.
    days_left: int
    rate_basis: str
    rows: list[FastDsRowResponse]
    total_value_inr: int
    complete: bool
    warnings: list[str]
