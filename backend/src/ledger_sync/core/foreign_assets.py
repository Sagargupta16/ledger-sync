"""Rules and records for rupee values of RSU vests and the shares they become.

A computation aid, not tax advice. A vest's perquisite becomes rupees at the
employer's reported figure when the user enters it; otherwise at the SBI TT
buying rate the user looked up for the specified date (the last day of the
month before the vest month: r.115 of the Income-tax Rules 1962 for vests up to
2026-03-31, r.206/207 of the Income-tax Rules 2026 after); otherwise at the vest
price the app already converted at the ECB reference rate, an approximation.

Mirrored for the Settings page in frontend ``lib/rsuTaxFx.ts``; change both together.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

# Received units are estimated like the frontend's netVestingQuantity (30% tax
# plus 4% cess on it) only until the user enters the actual units.
ESTIMATED_NET_SHARE = Decimal(1) - Decimal("0.30") - Decimal("0.30") * Decimal("0.04")
NEW_RULES_FROM = date(2026, 4, 1)
# A published rate card up to this many days before the specified date still
# counts: SBI skips weekends, holidays and some working days.
TTBR_LOOKBACK_DAYS = 7
_PAISA = Decimal("0.01")
_RUPEE = Decimal(1)


class RsuTaxRuleError(ValueError):
    """The values do not fit the vest, the event or the dates."""


class RsuTaxNotFoundError(LookupError):
    """No such vest, event or grant stock for this user."""


class RsuTaxConflictError(RuntimeError):
    """The record changed while it was being saved."""


def specified_date(event_day: date) -> date:
    """The last day of the month before ``event_day``'s month."""
    return event_day.replace(day=1) - timedelta(days=1)


def conversion_rule(event_day: date) -> str:
    """Which rule sets the conversion date for an event on ``event_day``."""
    if event_day >= NEW_RULES_FROM:
        return "Income-tax Rules 2026, r.206/207"
    return "Income-tax Rules 1962, r.115"


def ttbr_date_matches(event_day: date, rate_day: date) -> bool:
    """A rate card dated on, or shortly before, the event's specified date."""
    target = specified_date(event_day)
    return target - timedelta(days=TTBR_LOOKBACK_DAYS) <= rate_day <= target


def derive_fx_source(employer_perquisite_inr: Decimal | None, fx_rate: Decimal | None) -> str:
    if employer_perquisite_inr is not None:
        return "employer"
    return "sbi_ttbr" if fx_rate is not None else "ecb"


def require_past(day: date, today: date, message: str) -> None:
    if day > today:
        raise RsuTaxRuleError(message)


def rate_card_date(
    event_day: date, fx_rate: Decimal | None, fx_date: date | None, today: date
) -> date | None:
    """The rate card's date: as entered, else the specified date when a rate is given."""
    if fx_rate is not None and fx_date is None:
        fx_date = specified_date(event_day)
    if fx_date is not None:
        require_past(fx_date, today, "The rate date cannot be in the future.")
    return fx_date


def require_sale_after_vest(sale_day: date, vest_day: date) -> None:
    if sale_day < vest_day:
        raise RsuTaxRuleError("A sale cannot come before the vest it sold from.")


def same_stock(left: str, right: str) -> bool:
    """Grant stock names and event symbols compare as tickers: case and spaces ignored."""
    return left.strip().upper() == right.strip().upper()


def paisa(value: Decimal) -> Decimal:
    return value.quantize(_PAISA, rounding=ROUND_HALF_UP)


def rupees(value: Decimal) -> Decimal:
    """Whole rupees, as the return forms take them."""
    return value.quantize(_RUPEE, rounding=ROUND_HALF_UP)


@dataclass(frozen=True, slots=True)
class VestRecord:
    vesting_id: str
    grant_id: str
    # The grant's stock name as a ticker, upper case.
    symbol: str
    vest_date: date
    gross_quantity: Decimal
    net_quantity: Decimal | None
    # The saved vest price, which the app converts to the display currency.
    price_at_vest: Decimal | None


@dataclass(frozen=True, slots=True)
class VestFxRecord:
    fx_source: str
    fx_rate: Decimal | None
    fx_date: date | None
    quote_price: Decimal | None
    quote_currency: str
    employer_perquisite_inr: Decimal | None


@dataclass(frozen=True, slots=True)
class SaleRecord:
    event_id: int
    lot_id: str | None
    symbol: str
    day: date
    # Shares sold, counted as on the sale date (after any split before it).
    quantity: Decimal
    proceeds: Decimal
    fx_rate: Decimal | None


@dataclass(frozen=True, slots=True)
class DividendRecord:
    event_id: int
    symbol: str
    day: date
    gross: Decimal
    tax_withheld: Decimal
    fx_rate: Decimal | None


@dataclass(frozen=True, slots=True)
class VestValue:
    source: str
    tax_value_inr: Decimal | None
    ecb_value_inr: Decimal | None
    flags: tuple[str, ...]

    @property
    def difference_inr(self) -> Decimal | None:
        if self.tax_value_inr is None or self.ecb_value_inr is None:
            return None
        return self.tax_value_inr - self.ecb_value_inr


def value_vest(vest: VestRecord, fx: VestFxRecord | None, *, prices_in_inr: bool) -> VestValue:
    """The perquisite for the whole gross vest in rupees, and where it came from.

    ``prices_in_inr`` is False when the display currency is not INR: Settings
    then saves vest prices in that currency, so they cannot stand in for rupees.
    """
    known_price = vest.price_at_vest if prices_in_inr else None
    ecb_value = known_price * vest.gross_quantity if known_price is not None else None
    if fx is not None and fx.employer_perquisite_inr is not None:
        return VestValue("employer", fx.employer_perquisite_inr, ecb_value, ())
    if fx is not None and fx.fx_rate is not None and fx.quote_price is not None:
        matches = fx.fx_date is not None and ttbr_date_matches(vest.vest_date, fx.fx_date)
        ttbr_flags: tuple[str, ...] = () if matches else ("fx_date_mismatch",)
        return VestValue(
            "sbi_ttbr", fx.quote_price * fx.fx_rate * vest.gross_quantity, ecb_value, ttbr_flags
        )
    if not prices_in_inr and vest.price_at_vest is not None:
        return VestValue("ecb", None, None, ("fx_approximate", "vest_price_not_inr"))
    missing = () if ecb_value is not None else ("missing_vest_price",)
    return VestValue("ecb", ecb_value, ecb_value, ("fx_approximate", *missing))
