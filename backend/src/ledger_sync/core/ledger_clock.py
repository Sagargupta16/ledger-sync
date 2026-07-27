"""The single source of truth for "now" and "today" in ledger terms.

Every date the user sees is an Indian wall-clock date. The whole product is
built on the Apr-Mar financial year, transactions are entered against IST
calendar days, and the stored ``Transaction.date`` column is a naive IST
wall-clock value with no offset attached.

That makes ``datetime.now(UTC)`` the wrong anchor for any user-facing window,
and wrong in two distinct ways:

1. **Date is off by one for 5.5 hours a day.** Between 18:30 and 24:00 UTC it is
   already tomorrow in India. A transaction the user enters at 01:00 IST reads
   as future-dated against a UTC "today".
2. **Month and financial-year boundaries land in the previous period.** At 02:00
   IST on 1 April 2026, ``datetime.now(UTC)`` is 2026-03-31 20:30, so a
   "this month" window opens on 1 March and the financial year resolves to
   FY2025-26 instead of FY2026-27. The user opens the app on the first morning
   of the new financial year and every FY figure is a year stale.

Mixing the two representations is the second half of the trap: comparing an
aware bound against the naive ``date`` column raises ``TypeError`` in pure
Python, and in SQL the driver silently drops the offset, so the bug is invisible
in tests that only exercise the query path. Anchoring here returns **naive IST**
values that match the column, which keeps both paths honest.

A fixed offset is correct for India: there is no DST and the country has kept
UTC+05:30 since 1945.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

# India Standard Time. Deliberately a fixed offset rather than a ZoneInfo
# lookup: there is no DST to model, and a fixed offset cannot fail on a machine
# with no tzdata installed (Vercel's serverless image is one such environment).
IST_OFFSET = timedelta(hours=5, minutes=30)


def ledger_now() -> datetime:
    """Current IST wall-clock time as a **naive** datetime.

    Naive on purpose: it is directly comparable to ``Transaction.date``, which
    is a naive IST value. Returning an aware datetime here would push the
    offset problem out to every caller.
    """
    return datetime.now(UTC).replace(tzinfo=None) + IST_OFFSET


def ledger_today() -> date:
    """Today's date in IST."""
    return ledger_now().date()


def ledger_today_iso() -> str:
    """Today's IST date as ``YYYY-MM-DD``, the wire format used by the API."""
    return ledger_today().isoformat()


def to_ledger_time(moment: datetime) -> datetime:
    """Convert any instant to naive IST wall-clock time.

    Accepts either an aware datetime (converted) or a naive one (assumed to
    already be IST and returned unchanged), so callers holding a stored value
    and callers holding ``datetime.now(UTC)`` can share one code path.
    """
    if moment.tzinfo is None:
        return moment
    return moment.astimezone(UTC).replace(tzinfo=None) + IST_OFFSET


def start_of_month(moment: datetime | None = None) -> datetime:
    """Midnight on the first of the IST month containing *moment*."""
    anchor = ledger_now() if moment is None else to_ledger_time(moment)
    return anchor.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def start_of_year(moment: datetime | None = None) -> datetime:
    """Midnight on 1 January of the IST calendar year containing *moment*."""
    anchor = ledger_now() if moment is None else to_ledger_time(moment)
    return anchor.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)


def financial_year_start(moment: datetime | None = None) -> datetime:
    """Midnight on 1 April opening the Indian financial year of *moment*.

    January to March belong to the financial year that opened the *previous*
    April, which is exactly the boundary a UTC anchor gets wrong on 1 April.
    """
    anchor = ledger_now() if moment is None else to_ledger_time(moment)
    year = anchor.year if anchor.month >= 4 else anchor.year - 1
    # Naive by contract: every value this module returns is naive IST so it
    # compares directly against the naive ``Transaction.date`` column.
    return datetime(year, 4, 1)  # noqa: DTZ001


def financial_year_label(moment: datetime | None = None) -> str:
    """The Indian financial year of *moment* as ``FY2026-27``."""
    start = financial_year_start(moment)
    return f"FY{start.year}-{str(start.year + 1)[-2:]}"
