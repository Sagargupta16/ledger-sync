"""Warnings the foreign-asset reports show above their figures.

A worksheet that silently drops a record is worse than one that says so, so
every sale or dividend that reaches no Schedule FA row is listed by date and
amount, and the export carries the same lines.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence

from ledger_sync.core.foreign_assets_lots import Lot
from ledger_sync.core.foreign_assets_market import MarketData
from ledger_sync.core.foreign_assets_records import EventRecord
from ledger_sync.core.foreign_assets_schedule import Period

_LISTED = 5


def indian_note(indian: Iterable[str]) -> list[str]:
    names = sorted(indian)
    if not names:
        return []
    return [f"{', '.join(names)} trade in rupees, so they are left out as Indian assets."]


def lot_notes(lots: Sequence[Lot]) -> list[str]:
    notes: list[str] = []
    if any("vest_price_not_inr" in lot.flags for lot in lots):
        notes.append(
            "Your display currency is not INR, so the vest prices saved in Settings are not "
            "rupees. Lots without the employer's figure or an SBI TT buying rate have no rupee "
            "cost until you record one in Settings."
        )
    split_checks: dict[str, set[str]] = {}
    for lot in lots:
        if "vest_price_pre_split" in lot.flags:
            labels = split_checks.setdefault(lot.vest.symbol, set())
            labels.update(f"{split.label} on {split.day.isoformat()}" for split in lot.splits)
    for symbol, labels in sorted(split_checks.items()):
        notes.append(
            f"{symbol} split ({', '.join(sorted(labels))}) after vests valued at the ECB "
            "approximation. A vest price fetched in Settings comes split-adjusted, so check each "
            "against the vest confirmation, or record the SBI TT buying rate, whose Fetch close "
            "undoes the split."
        )
    return notes


def _listing(events: Sequence[EventRecord], market: MarketData) -> str:
    shown = [
        f"{event.day.isoformat()} {market.currency(event.symbol)} {event.gross_amount:,.2f}"
        for event in events[:_LISTED]
    ]
    more = len(events) - _LISTED
    return ", ".join(shown) + (f" and {more} more" if more > 0 else "")


def _count(events: Sequence[EventRecord], noun: str) -> str:
    return f"1 {noun}" if len(events) == 1 else f"{len(events)} {noun}s"


def uncounted_notes(
    events: Sequence[EventRecord],
    period: Period,
    counted: set[int],
    indian: set[str],
    market: MarketData,
) -> list[str]:
    """One line each for the period's sales and dividends that reached no row."""
    missed = [
        event
        for event in events
        if period[0] <= event.day <= period[1]
        and event.id not in counted
        and event.symbol not in indian
    ]
    sales = [event for event in missed if event.kind == "sale"]
    dividends = [event for event in missed if event.kind == "dividend"]
    year, notes = period[0].year, []
    if sales:
        notes.append(
            f"{_count(sales, 'sale')} in {year} reached no Schedule FA row, so the proceeds are "
            f"left out of every total: {_listing(sales, market)}. Under Sales and dividends, "
            "link each sale to the vest it came from."
        )
    if dividends:
        notes.append(
            f"{_count(dividends, 'dividend')} in {year} reached no Schedule FA row, so the "
            f"amounts are left out of every total: {_listing(dividends, market)}. A dividend "
            "counts only when a lot of that stock held shares on its date."
        )
    return notes
