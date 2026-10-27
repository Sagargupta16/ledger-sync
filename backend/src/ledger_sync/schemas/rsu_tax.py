"""Request and response models for /api/rsu-tax (RSU tax FX, foreign-asset reports).

Stored inputs are exact decimals; computed values go out as JSON numbers.
Every figure is a computation aid for a return, not tax advice. Sale and
dividend amounts are always in the stock's own trading currency, so an event
carries no currency of its own.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

FxSource = Literal["ecb", "sbi_ttbr", "employer"]
# Why an event reaches no Schedule FA row, if it does not.
EventIssue = Literal["unlinked", "before_vest", "unknown_stock", "no_shares_held", "indian_stock"]
_CURRENCY = r"^[A-Z]{3}$"
_MAX_RATE = Decimal(1000)
_MAX_PRICE = Decimal(1_000_000)
_MAX_AMOUNT = Decimal(1_000_000_000_000)


def _no_nul(value: str | None) -> str | None:
    if value is not None and "\x00" in value:
        raise ValueError("Text cannot contain a NUL character.")
    return value


class VestFxUpsert(BaseModel):
    """What the user knows about one vest's conversion; the source is derived."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    quote_price: Decimal | None = Field(default=None, gt=0, le=_MAX_PRICE)
    quote_currency: str = Field(default="USD", pattern=_CURRENCY)
    fx_rate: Decimal | None = Field(default=None, gt=0, le=_MAX_RATE)
    fx_date: date | None = None
    employer_perquisite_inr: Decimal | None = Field(default=None, gt=0, le=_MAX_AMOUNT)

    @model_validator(mode="after")
    def _usable(self) -> VestFxUpsert:
        if self.fx_rate is not None and self.quote_price is None:
            raise ValueError(
                "Enter the vest-date price per share to convert at the TT buying rate."
            )
        if (
            self.fx_rate is None
            and self.employer_perquisite_inr is None
            and self.quote_price is None
        ):
            raise ValueError("Enter the employer's perquisite value or an SBI TT buying rate.")
        return self


class VestFxResponse(BaseModel):
    vesting_id: str
    fx_source: FxSource
    fx_rate: float | None
    fx_date: date | None
    quote_price: float | None
    quote_currency: str
    employer_perquisite_inr: float | None
    updated_at: datetime


class VestCloseResponse(BaseModel):
    """The real close on or just before a vest date, with the split adjustment undone."""

    symbol: str
    currency: str
    price: float
    as_of: date
    # Yahoo's figure for that day, on today's share count.
    adjusted_price: float
    # Shares today per share on ``as_of``: 20 after one later 20-for-1 split.
    split_factor: float


class ForeignAssetEventCreate(BaseModel):
    """A sale names the vest (lot) it came from; a dividend names the stock."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    kind: Literal["sale", "dividend"]
    lot_id: str | None = Field(default=None, min_length=1, max_length=64)
    symbol: str | None = Field(default=None, min_length=1, max_length=40)
    event_date: date
    # Shares sold as the broker shows them, on the sale date's count.
    quantity: Decimal | None = Field(default=None, gt=0, le=_MAX_PRICE)
    gross_amount: Decimal = Field(gt=0, le=_MAX_AMOUNT)
    tax_withheld: Decimal | None = Field(default=None, ge=0, le=_MAX_AMOUNT)
    fx_rate: Decimal | None = Field(default=None, gt=0, le=_MAX_RATE)
    fx_date: date | None = None
    notes: str | None = Field(default=None, max_length=200)

    @field_validator("lot_id", "symbol", "notes")
    @classmethod
    def _text(cls, value: str | None) -> str | None:
        return _no_nul(value)

    @model_validator(mode="after")
    def _complete(self) -> ForeignAssetEventCreate:
        if self.kind == "sale" and (self.lot_id is None or self.quantity is None):
            raise ValueError("A sale needs the vest it came from and the number of shares sold.")
        if self.kind == "dividend" and self.symbol is None:
            raise ValueError("A dividend needs the stock that paid it.")
        if self.tax_withheld is not None and self.tax_withheld > self.gross_amount:
            raise ValueError("Tax withheld cannot exceed the gross amount.")
        return self


class ForeignAssetEventLink(BaseModel):
    """Point a sale at another vest, or a dividend at another of the user's stocks."""

    model_config = ConfigDict(extra="forbid")

    lot_id: str | None = Field(default=None, min_length=1, max_length=64)
    symbol: str | None = Field(default=None, min_length=1, max_length=40)

    @field_validator("lot_id", "symbol")
    @classmethod
    def _text(cls, value: str | None) -> str | None:
        return _no_nul(value)

    @model_validator(mode="after")
    def _one(self) -> ForeignAssetEventLink:
        if (self.lot_id is None) == (self.symbol is None):
            raise ValueError("Send either the vest for a sale or the stock for a dividend.")
        return self


class ForeignAssetEventResponse(BaseModel):
    id: int
    kind: Literal["sale", "dividend"]
    lot_id: str | None
    symbol: str
    event_date: date
    quantity: float | None
    gross_amount: float
    tax_withheld: float | None
    # The stock's trading currency, once the lot ledger has loaded its prices.
    currency: str | None = None
    fx_rate: float | None
    fx_date: date | None
    # Only when the user entered a rate; the reports fill an ECB approximation.
    amount_inr: float | None
    notes: str | None
    # Set by the lot ledger when the event reaches no Schedule FA row.
    issue: EventIssue | None = None
