"""AMFI's daily NAV file: download, parse by header name, and the once-a-day refresh rule.

``NAVAll.txt`` is free and keyless. The www.amfiindia.com URL now redirects to
portal.amfiindia.com, so the client must follow redirects. The file is
semicolon-separated: one header row, then scheme rows mixed with blank lines and
AMC or category headings that have no semicolons. AMFI inserted the Plan and
Option columns before Net Asset Value around 2026-08-19, which broke every parser
that read columns by position, so this one maps columns by header name and fails
loudly when a required column is missing. Checked live on 2026-10-27: 14,413
scheme rows, eight columns, newest NAV date 26-Oct-2026.

Freshness: SEBI's latest NAV deadline is 10:00 IST on T+1 (fund-of-funds and
overseas funds; most schemes publish by 23:00 IST on T), so a file fetched after
10:30 IST holds every NAV for the previous business day. A cached NAV is fresh
when it was checked after the most recent 10:30 IST, which means at most one
download a day per new set of schemes, on demand, with no cron.
"""

from __future__ import annotations

import re
from collections.abc import Collection
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from typing import TYPE_CHECKING

from ledger_sync.core.ledger_clock import IST_OFFSET

if TYPE_CHECKING:
    from datetime import date

    import httpx

NAV_ALL_URL = "https://www.amfiindia.com/spages/NAVAll.txt"
REFRESH_TIME_IST = time(10, 30)
# A failed download is not retried for this long, so an AMFI outage costs one
# slow request rather than one per page view (per server instance).
FAILURE_BACKOFF = timedelta(minutes=15)
_TIMEOUT_SECONDS = 30.0
# The real file is about 1.5 MB; anything far larger is not the NAV file.
_MAX_BYTES = 20 * 1024 * 1024
_USER_AGENT = "ledger-sync (personal finance app; daily NAV refresh)"
ISIN_RE = re.compile(r"^IN[A-Z0-9]{10}$")
# Header names with spaces removed and lowercased: "ISIN Div Payout/ ISIN Growth"
# becomes "isindivpayout/isingrowth".
_CODE, _NAME, _NAV, _DATE = "schemecode", "schemename", "netassetvalue", "date"
_REQUIRED = {_CODE: "Scheme Code", _NAME: "Scheme Name", _NAV: "Net Asset Value", _DATE: "Date"}


@dataclass(slots=True)
class _DownloadState:
    """Per-process memory of the last failed download, like exchange_rates' cache."""

    last_failure: datetime | None = None


_state = _DownloadState()


class NavFileError(ValueError):
    """The download is not a NAV file this parser can trust."""


@dataclass(frozen=True, slots=True)
class NavQuote:
    """One scheme row of the NAV file."""

    scheme_code: str
    scheme_name: str
    nav: Decimal
    nav_date: date


def isin_key(isin: str) -> str:
    return f"isin:{isin.strip().upper()}"


def code_key(code: str) -> str:
    return f"code:{code.strip()}"


def _header_name(cell: str) -> str:
    return re.sub(r"\s+", "", cell).lower()


def _nav_value(cell: str) -> Decimal | None:
    try:
        value = Decimal(cell.replace(",", ""))
    except InvalidOperation:
        return None  # "N.A." and similar placeholders
    return value if value.is_finite() and value > 0 else None


def _nav_date(cell: str) -> date | None:
    try:
        return datetime.strptime(cell, "%d-%b-%Y").replace(tzinfo=UTC).date()
    except ValueError:
        return None


@dataclass(frozen=True, slots=True)
class _Layout:
    """Where the columns sit, found by header name."""

    index: dict[str, int]
    isin_columns: list[int]
    width: int


def _layout(header: str) -> _Layout:
    """The columns by name. Raises NavFileError when a required one is missing."""
    columns = [_header_name(cell) for cell in header.split(";")]
    index = {name: position for position, name in enumerate(columns)}
    missing = [label for name, label in _REQUIRED.items() if name not in index]
    isin_columns = [position for name, position in index.items() if name.startswith("isin")]
    if missing or not isin_columns:
        absent = ", ".join(missing) or "ISIN"
        raise NavFileError(f"The AMFI NAV file has no {absent} column; its layout changed.")
    return _Layout(index, isin_columns, len(columns))


def parse_nav_all(text: str, wanted: Collection[str]) -> dict[str, NavQuote]:
    """Quotes for the wanted lookup keys (see ``isin_key`` and ``code_key``).

    Raises NavFileError when the header lacks a required column or the file has
    no scheme rows at all (an HTML error page served with status 200, say).
    """
    lines = text.splitlines()
    layout = _layout(next((line for line in lines if line.strip()), ""))
    index = layout.index
    found: dict[str, NavQuote] = {}
    rows = 0
    for line in lines[1:]:
        cells = [cell.strip() for cell in line.split(";")]
        if len(cells) != layout.width:
            continue  # blank lines and AMC or category headings
        nav = _nav_value(cells[index[_NAV]])
        nav_date = _nav_date(cells[index[_DATE]])
        if nav is None or nav_date is None:
            continue
        rows += 1
        quote = NavQuote(cells[index[_CODE]], cells[index[_NAME]], nav, nav_date)
        keys = [code_key(quote.scheme_code)]
        keys += [isin_key(cells[i]) for i in layout.isin_columns if ISIN_RE.match(cells[i].upper())]
        for key in keys:
            previous = found.get(key)
            if key in wanted and (previous is None or quote.nav_date > previous.nav_date):
                found[key] = quote
    if rows == 0:
        raise NavFileError("The AMFI NAV file had no scheme rows.")
    return found


async def download_nav_all(client: httpx.AsyncClient) -> str:
    """The NAV file as text, following AMFI's redirect, with a size cap."""
    chunks: list[bytes] = []
    size = 0
    async with client.stream(
        "GET",
        NAV_ALL_URL,
        follow_redirects=True,
        timeout=_TIMEOUT_SECONDS,
        headers={"User-Agent": _USER_AGENT},
    ) as response:
        response.raise_for_status()
        async for chunk in response.aiter_bytes():
            size += len(chunk)
            if size > _MAX_BYTES:
                raise NavFileError("The AMFI NAV download was far larger than expected.")
            chunks.append(chunk)
    return b"".join(chunks).decode("utf-8-sig", errors="replace")


def utc_now() -> datetime:
    """Now as naive UTC, the form ``MfNavPrice.checked_at`` stores."""
    return datetime.now(UTC).replace(tzinfo=None)


def refresh_cutoff(now: datetime) -> datetime:
    """The most recent 10:30 IST at or before *now*; both naive UTC."""
    ist = now + IST_OFFSET
    cutoff = datetime.combine(ist.date(), REFRESH_TIME_IST)
    if ist < cutoff:
        cutoff -= timedelta(days=1)
    return cutoff - IST_OFFSET


def in_failure_backoff(now: datetime) -> bool:
    failed = _state.last_failure
    return failed is not None and now - failed < FAILURE_BACKOFF


def record_download(now: datetime, *, ok: bool) -> None:
    _state.last_failure = None if ok else now
