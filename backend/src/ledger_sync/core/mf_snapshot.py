"""A user's holdings with their cached NAVs, and the once-a-day refresh that keeps them fresh.

``load_snapshot`` and ``save_quotes`` each open and close their own session, so
``refresh_if_due`` holds no database connection while AMFI's NAV file downloads.
The refresh rule (see core/amfi_nav.py): a NAV is fresh when it was checked after
the latest 10:30 IST, and a failed download is not retried for a few minutes.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime

import httpx
from anyio import to_thread
from sqlalchemy.exc import SQLAlchemyError

from ledger_sync.core.amfi_nav import (
    NavFileError,
    NavQuote,
    download_nav_all,
    in_failure_backoff,
    parse_nav_all,
    record_download,
    refresh_cutoff,
)
from ledger_sync.core.mf_nav_store import CachedNav, load_navs, save_navs
from ledger_sync.core.mf_store import ImportRecord, load_positions
from ledger_sync.core.mf_valuation import Position, lookup_keys
from ledger_sync.db import session as db_session
from ledger_sync.utils.logging import logger

NAV_UNAVAILABLE = (
    "AMFI's NAV file could not be downloaded just now, so values use the last NAVs "
    "saved, or the statement's own NAV."
)


@dataclass(frozen=True, slots=True)
class Snapshot:
    positions: list[Position]
    imports: list[ImportRecord]
    keys: frozenset[str]
    navs: dict[str, CachedNav]

    def stale_keys(self, cutoff: datetime) -> set[str]:
        return {
            key for key in self.keys if key not in self.navs or self.navs[key].checked_at < cutoff
        }

    def with_quotes(self, quotes: Mapping[str, NavQuote], checked_at: datetime) -> Snapshot:
        """The cache as ``save_navs`` just wrote it."""
        navs = dict(self.navs)
        for key in self.keys:
            quote, cached = quotes.get(key), navs.get(key)
            if quote is not None:
                navs[key] = CachedNav(quote.nav, quote.nav_date, checked_at)
            elif cached is not None:
                navs[key] = CachedNav(cached.nav, cached.nav_date, checked_at)
            else:
                navs[key] = CachedNav(None, None, checked_at)
        return Snapshot(self.positions, self.imports, self.keys, navs)


def load_snapshot(user_id: int) -> Snapshot:
    with db_session.SessionLocal() as session:
        positions, imports = load_positions(session, user_id)
        keys = frozenset(key for p in positions for key in lookup_keys(p.isin, p.amfi_code))
        return Snapshot(positions, imports, keys, load_navs(session, keys))


def save_quotes(quotes: Mapping[str, NavQuote], keys: frozenset[str], checked_at: datetime) -> None:
    with db_session.SessionLocal() as session:
        save_navs(session, quotes, keys, checked_at)


async def refresh_if_due(
    client: httpx.AsyncClient, snapshot: Snapshot, now: datetime
) -> tuple[Snapshot, str | None]:
    """Fetch AMFI's NAV file when a held scheme's NAV predates the latest 10:30 IST.

    Returns the snapshot with any fresh NAVs, and a message for the user when AMFI
    could not be reached (the snapshot then keeps the NAVs already saved).
    """
    if not snapshot.stale_keys(refresh_cutoff(now)):
        return snapshot, None
    if in_failure_backoff(now):
        return snapshot, NAV_UNAVAILABLE
    try:
        text = await download_nav_all(client)
        quotes = await to_thread.run_sync(parse_nav_all, text, snapshot.keys)
    except (httpx.HTTPError, NavFileError) as error:
        record_download(now, ok=False)
        logger.warning("AMFI NAV refresh failed (%s)", type(error).__name__)
        return snapshot, NAV_UNAVAILABLE
    record_download(now, ok=True)
    try:
        await to_thread.run_sync(save_quotes, quotes, snapshot.keys, now)
    except SQLAlchemyError as error:
        # The response still carries the fresh NAVs; the next read retries the write.
        logger.warning("NAV cache write failed (%s)", type(error).__name__)
    return snapshot.with_quotes(quotes, now), None
