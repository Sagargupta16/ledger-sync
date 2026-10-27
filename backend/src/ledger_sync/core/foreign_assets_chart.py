"""Parse Yahoo chart payloads (daily quotes and split events) for the foreign-asset reports.

The chart API is unofficial. Quotes are split-adjusted to the share count of the
day they are fetched, and ``events.splits`` lists the splits in the requested
range, so a range that runs to today names every split behind the adjustment.
"""

from __future__ import annotations

import math
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from ledger_sync.core.foreign_assets_quotes import DailyQuote, Split

# Yahoo quotes some listings in a minor unit: London in pence, Johannesburg in
# cents, Tel Aviv in agorot. Every other code is a whole ISO currency unit.
MINOR_UNITS: dict[str, tuple[str, Decimal]] = {
    "GBp": ("GBP", Decimal("0.01")),
    "GBX": ("GBP", Decimal("0.01")),
    "ZAc": ("ZAR", Decimal("0.01")),
    "ILA": ("ILS", Decimal("0.01")),
}


def iso_currency(code: str) -> tuple[str, Decimal]:
    """The ISO code for a Yahoo currency and what one quoted unit is worth in it."""
    return MINOR_UNITS.get(code, (code.upper(), Decimal(1)))


def _decimal(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        return None
    return Decimal(repr(round(number, 4)))


def _at(values: list[Any], index: int) -> Any:
    return values[index] if index < len(values) else None


def _local_day(stamp: Any, offset: int) -> date:
    # Exchange-local trading days: a Tokyo or Sydney open is still "yesterday" in UTC.
    return datetime.fromtimestamp(int(stamp) + offset, tz=UTC).date()


def _splits(result: dict[str, Any], offset: int) -> list[Split]:
    events = (result.get("events") or {}).get("splits") or {}
    found: list[Split] = []
    for event in events.values():
        numerator, denominator = (
            _decimal(event.get("numerator")),
            _decimal(event.get("denominator")),
        )
        if numerator is None or denominator is None or numerator == denominator:
            continue
        found.append(Split(_local_day(event["date"], offset), numerator, denominator))
    return sorted(found, key=lambda split: split.day)


def parse_chart(
    payload: dict[str, Any],
) -> tuple[str, str | None, list[DailyQuote], list[Split]]:
    """ISO currency, company name, daily quotes (oldest first) and splits from a chart payload."""
    result = payload["chart"]["result"][0]
    meta = result["meta"]
    offset = int(meta.get("gmtoffset") or 0)
    block = result["indicators"]["quote"][0]
    closes, highs, lows = block["close"], block.get("high") or [], block.get("low") or []
    currency, scale = iso_currency(str(meta.get("currency") or "USD"))
    quotes: list[DailyQuote] = []
    for index, stamp in enumerate(result.get("timestamp") or []):
        close = _decimal(_at(closes, index))
        if close is None:
            continue
        high, low = _decimal(_at(highs, index)), _decimal(_at(lows, index))
        quotes.append(
            DailyQuote(
                _local_day(stamp, offset),
                close * scale,
                None if high is None else high * scale,
                None if low is None else low * scale,
            )
        )
    quotes.sort(key=lambda item: item.day)
    name = meta.get("longName") or meta.get("shortName")
    return currency, str(name) if name else None, quotes, _splits(result, offset)
