"""The response for ``GET /api/mf-holdings``, built from a snapshot of holdings and NAVs."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from ledger_sync.core.amfi_nav import refresh_cutoff
from ledger_sync.core.mf_snapshot import Snapshot
from ledger_sync.core.mf_store import ImportRecord
from ledger_sync.core.mf_valuation import (
    Summary,
    Valuation,
    drop_duplicates,
    summarise,
    value_position,
)
from ledger_sync.schemas.cas import (
    MfHoldingResponse,
    MfHoldingsResponse,
    MfHoldingsSummary,
    MfImportInfo,
    MfNavStatus,
)


def _number(value: Decimal | None) -> float | None:
    return None if value is None else float(value)


def _utc(moment: datetime) -> datetime:
    """Stored timestamps are naive UTC; the wire format carries the offset."""
    return moment.replace(tzinfo=UTC)


def _holding(valuation: Valuation) -> MfHoldingResponse:
    position, price = valuation.position, valuation.price
    return MfHoldingResponse(
        id=position.id,
        source=position.source,
        folio=position.folio,
        amc=position.amc,
        scheme_name=position.scheme_name,
        isin=position.isin,
        amfi_code=position.amfi_code,
        scheme_type=position.scheme_type,
        units=float(position.units),
        nav=_number(price.nav) if price else None,
        nav_date=price.nav_date if price else None,
        nav_source=price.source if price else None,
        current_value=_number(valuation.value),
        cost=_number(position.cost),
        gain=_number(valuation.gain),
        gain_pct=valuation.gain_pct,
        xirr=valuation.xirr,
        xirr_since=min((day for day, _ in valuation.flows), default=None),
        xirr_note=valuation.xirr_note,
    )


def _summary(summary: Summary) -> MfHoldingsSummary:
    return MfHoldingsSummary(
        current_value=float(summary.current_value),
        cost=_number(summary.cost),
        gain=_number(summary.gain),
        gain_pct=summary.gain_pct,
        xirr=summary.xirr,
        xirr_since=summary.xirr_since,
        xirr_schemes=summary.xirr_schemes,
        holdings=summary.holdings,
        closed=summary.closed,
        cost_schemes=summary.cost_schemes,
        unpriced_schemes=summary.unpriced_schemes,
    )


def _nav_status(
    snapshot: Snapshot, holdings: list[MfHoldingResponse], now: datetime, message: str | None
) -> MfNavStatus:
    amfi_dates: list[date] = [h.nav_date for h in holdings if h.nav_source == "amfi" and h.nav_date]
    checks = [cached.checked_at for cached in snapshot.navs.values()]
    return MfNavStatus(
        checked_at=_utc(max(checks)) if checks else None,
        newest_nav_date=max(amfi_dates, default=None),
        stale=bool(snapshot.stale_keys(refresh_cutoff(now))),
        message=message,
    )


def _import_info(record: ImportRecord) -> MfImportInfo:
    return MfImportInfo(
        source=record.source,
        cas_type=record.cas_type,
        statement_from=record.statement_from,
        statement_to=record.statement_to,
        imported_at=_utc(record.imported_at),
        schemes=record.schemes,
    )


def build_response(snapshot: Snapshot, now: datetime, message: str | None) -> MfHoldingsResponse:
    """Value every held scheme at the snapshot's NAVs. *now* is naive UTC, like the cache."""
    prices: dict[str, tuple[Decimal, date]] = {
        key: (cached.nav, cached.nav_date)
        for key, cached in snapshot.navs.items()
        if cached.nav is not None and cached.nav_date is not None
    }
    valuations = [value_position(p, prices) for p in drop_duplicates(snapshot.positions)]
    holdings = sorted(
        (_holding(v) for v in valuations if v.position.units > 0),
        key=lambda h: h.current_value or 0.0,
        reverse=True,
    )
    return MfHoldingsResponse(
        holdings=holdings,
        summary=_summary(summarise(valuations)),
        nav=_nav_status(snapshot, holdings, now, message),
        imports=[_import_info(record) for record in snapshot.imports],
    )
