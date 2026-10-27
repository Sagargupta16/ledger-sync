"""Value CAS holdings at the latest NAV, with cost, gain and XIRR per holding and overall.

A holding gets an XIRR only when its statement starts from zero units: an opening
balance means purchases before the statement period are missing. The portfolio
XIRR pools every holding with a complete history, redeemed ones included.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Literal

from ledger_sync.core.amfi_nav import code_key, isin_key
from ledger_sync.core.cas_records import RTA_SOURCES, CasTransaction
from ledger_sync.core.mf_xirr import Flow, holding_flows, xirr

_CENT = Decimal("0.01")
_UNIT_TOLERANCE = Decimal("0.001")
# Why a holding has no XIRR (also the API contract, see schemas/cas.py).
# no_transactions: a summary or depository CAS lists no dated rows.
# opening_balance: the statement starts after the first purchase.
# no_nav: neither AMFI nor the statement gave a NAV to value it today.
# no_solution: the flows have no rate (all in, or all out).
XirrNote = Literal["no_transactions", "opening_balance", "no_nav", "no_solution"]
PriceSource = Literal["amfi", "statement"]


@dataclass(frozen=True, slots=True)
class Position:
    """A stored holding, read back for valuation."""

    id: int
    source: str
    cas_type: str | None
    folio: str | None
    amc: str | None
    scheme_name: str
    isin: str | None
    amfi_code: str | None
    scheme_type: str | None
    open_units: Decimal | None
    units: Decimal
    cost: Decimal | None
    statement_nav: Decimal | None
    statement_nav_date: date | None
    transactions: tuple[CasTransaction, ...]


@dataclass(frozen=True, slots=True)
class Price:
    """A NAV and where it came from: AMFI's daily file or the statement itself."""

    nav: Decimal
    nav_date: date | None
    source: PriceSource


@dataclass(frozen=True, slots=True)
class Valuation:
    position: Position
    price: Price | None
    value: Decimal | None
    gain: Decimal | None
    gain_pct: float | None
    xirr: float | None
    xirr_note: XirrNote | None
    # Every flow of a complete history, the terminal value included; empty otherwise.
    flows: tuple[Flow, ...]


@dataclass(frozen=True, slots=True)
class Summary:
    current_value: Decimal
    cost: Decimal | None
    gain: Decimal | None
    gain_pct: float | None
    xirr: float | None
    xirr_since: date | None
    xirr_schemes: int
    holdings: int
    closed: int
    # Held schemes that Cost and Gain cover: those with both a value and a cost.
    cost_schemes: int
    # Held schemes with no NAV at all, which add nothing to the market value.
    unpriced_schemes: int


def lookup_keys(isin: str | None, amfi_code: str | None) -> list[str]:
    """NAV cache keys for a scheme, its ISIN first."""
    keys = [isin_key(isin)] if isin else []
    return [*keys, code_key(amfi_code)] if amfi_code else keys


def fifo_cost(rows: Iterable[CasTransaction]) -> Decimal | None:
    """Cost of the units left, first in first out; None when sales outrun purchases.

    A reversal cancels the newest purchase, so it comes off the last lot.
    """
    lots: deque[list[Decimal]] = deque()  # [units, cost per unit]
    for row in rows:
        units = row.units
        if not units:
            continue
        if units > 0:
            paid = abs(row.amount) if row.amount is not None else units * (row.nav or 0)
            lots.append([units, paid / units])
            continue
        remaining, newest_first = -units, row.txn_type == "REVERSAL"
        while remaining > 0 and lots:
            lot = lots[-1] if newest_first else lots[0]
            used = min(lot[0], remaining)
            lot[0] -= used
            remaining -= used
            if lot[0] > 0:
                continue
            if newest_first:
                lots.pop()
            else:
                lots.popleft()
        if remaining > _UNIT_TOLERANCE:
            return None
    return sum((units * price for units, price in lots), Decimal(0)).quantize(_CENT)


def pick_price(position: Position, navs: Mapping[str, tuple[Decimal, date]]) -> Price | None:
    """AMFI's NAV unless the statement's own NAV is newer (an AMFI refresh that failed)."""
    statement = None
    if position.statement_nav:
        statement = Price(position.statement_nav, position.statement_nav_date, "statement")
    for key in lookup_keys(position.isin, position.amfi_code):
        if key in navs:
            nav, nav_date = navs[key]
            if statement and statement.nav_date and statement.nav_date > nav_date:
                return statement
            return Price(nav, nav_date, "amfi")
    return statement


def _history_flows(position: Position, value: Decimal | None, price: Price | None) -> list[Flow]:
    flows = holding_flows(position.transactions)
    if value and price:
        days = [day for day, _ in flows]
        as_of = max([*days, price.nav_date] if price.nav_date else days, default=None)
        if as_of is not None:
            flows.append((as_of, float(value)))
    return flows


def value_position(position: Position, navs: Mapping[str, tuple[Decimal, date]]) -> Valuation:
    price = pick_price(position, navs)
    held = position.units > 0
    value: Decimal | None = Decimal(0)
    if held:
        value = (position.units * price.nav).quantize(_CENT) if price else None
    cost = position.cost if held else None
    gain = value - cost if value is not None and cost is not None else None
    gain_pct = float(gain / cost * 100) if gain is not None and cost else None
    flows: list[Flow] = []
    # A summary CAS prints the balance as both opening and closing units, so only
    # a detailed one's opening balance means its history starts mid-way.
    partial = position.open_units is None or position.open_units > 0
    if partial and position.cas_type == "DETAILED":
        note: XirrNote | None = "opening_balance"
    elif not position.transactions:
        note = "no_transactions"
    elif partial:
        note = "opening_balance"
    elif value is None:
        note = "no_nav"  # without today's value the flows would read as a total loss
    else:
        flows = _history_flows(position, value, price)
        note = None
    rate = xirr(flows) if flows else None
    if flows and rate is None:
        note = "no_solution"
    return Valuation(position, price, value, gain, gain_pct, rate, note, tuple(flows))


def _folio_base(folio: str | None) -> str:
    return "".join((folio or "").split()).split("/")[0]


def drop_duplicates(positions: Sequence[Position]) -> list[Position]:
    """Drop a depository row that repeats a CAMS/KFintech folio and ISIN.

    An NSDL or CDSL CAS also lists folios held with the registrars, so importing
    both kinds of statement would count those units twice. The registrar's row
    wins: it carries the transactions.
    """
    registrar = {
        (_folio_base(p.folio), p.isin) for p in positions if p.source in RTA_SOURCES and p.isin
    }
    return [
        p
        for p in positions
        if p.source in RTA_SOURCES or not p.folio or (_folio_base(p.folio), p.isin) not in registrar
    ]


def summarise(valuations: Sequence[Valuation]) -> Summary:
    held = [v for v in valuations if v.position.units > 0]
    costed = [v for v in held if v.value is not None and v.position.cost is not None]
    cost = sum((v.position.cost or Decimal(0) for v in costed), Decimal(0)) if costed else None
    gain = sum((v.gain or Decimal(0) for v in costed), Decimal(0)) if costed else None
    complete = [v for v in valuations if v.flows]
    flows = [flow for v in complete for flow in v.flows]
    return Summary(
        current_value=sum((v.value or Decimal(0) for v in held), Decimal(0)),
        cost=cost,
        gain=gain,
        gain_pct=float(gain / cost * 100) if gain is not None and cost else None,
        xirr=xirr(flows) if flows else None,
        xirr_since=min((day for day, _ in flows), default=None),
        xirr_schemes=len(complete),
        holdings=len(held),
        closed=len(valuations) - len(held),
        cost_schemes=len(costed),
        unpriced_schemes=sum(1 for v in held if v.value is None),
    )
