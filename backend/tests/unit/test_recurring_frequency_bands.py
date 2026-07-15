"""Recurring detection -- frequency-band gap regression tests.

The original ``_FREQ_BANDS`` had closed-closed integer intervals
``[(4, 10), (11, 19), (20, 49), ...]`` checked with ``lo <= avg_diff <= hi``.
Because ``avg_diff`` is a float (mean of integer day-gaps), values like
10.5, 19.5, 49.5 fell through every band and the engine returned
``frequency = None``, silently dropping legitimate recurring patterns.

These tests pin the new behaviour: half-integer averages resolve to a
sensible adjacent frequency.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from ledger_sync.core.analytics_engine import AnalyticsEngine
from ledger_sync.db.base import Base
from ledger_sync.db.models import RecurrenceFrequency


def _engine() -> AnalyticsEngine:
    """Build an AnalyticsEngine wired to an in-memory SQLite session.

    The engine itself doesn't touch the DB for ``_detect_frequency``,
    but the constructor wants a session.
    """
    sql_engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(sql_engine)
    session_local = sessionmaker(bind=sql_engine)
    return AnalyticsEngine(session_local(), user_id=1)


def _dates_with_gaps(start: datetime, gaps: list[int]) -> list[datetime]:
    """Build a date sequence from ``start`` using ``gaps`` (in days).

    e.g. ``_dates_with_gaps(d, [7, 14])`` -> [d, d+7, d+21].
    """
    from datetime import timedelta

    out = [start]
    for gap in gaps:
        out.append(out[-1] + timedelta(days=gap))
    return out


# ─── Old-bug reproduction cases (should now resolve to a frequency) ─────


def test_avg_gap_10_5_resolves_to_weekly() -> None:
    """7 + 14 -> avg 10.5. Previously: None. Now: WEEKLY."""
    eng = _engine()
    dates = _dates_with_gaps(datetime(2026, 1, 1, tzinfo=UTC), [7, 14])
    freq, conf, _ = eng._detect_frequency(dates)
    assert freq == RecurrenceFrequency.WEEKLY
    assert conf > 0


def test_avg_gap_19_5_resolves_to_biweekly() -> None:
    """19 + 20 -> avg 19.5. Previously: None. Now: BIWEEKLY."""
    eng = _engine()
    dates = _dates_with_gaps(datetime(2026, 1, 1, tzinfo=UTC), [19, 20])
    freq, _, _ = eng._detect_frequency(dates)
    assert freq == RecurrenceFrequency.BIWEEKLY


def test_avg_gap_49_5_resolves_to_monthly() -> None:
    """Monthly bills with one delayed payment: 30 + 31 + 49 -> avg 36.7,
    fine. But 49 + 50 -> avg 49.5 used to fall through. Now: MONTHLY."""
    eng = _engine()
    dates = _dates_with_gaps(datetime(2026, 1, 1, tzinfo=UTC), [49, 50])
    freq, _, _ = eng._detect_frequency(dates)
    assert freq == RecurrenceFrequency.MONTHLY


def test_avg_gap_79_5_resolves_to_bimonthly() -> None:
    eng = _engine()
    dates = _dates_with_gaps(datetime(2026, 1, 1, tzinfo=UTC), [79, 80])
    freq, _, _ = eng._detect_frequency(dates)
    assert freq == RecurrenceFrequency.BIMONTHLY


def test_avg_gap_129_5_resolves_to_quarterly() -> None:
    eng = _engine()
    dates = _dates_with_gaps(datetime(2026, 1, 1, tzinfo=UTC), [129, 130])
    freq, _, _ = eng._detect_frequency(dates)
    assert freq == RecurrenceFrequency.QUARTERLY


def test_avg_gap_269_5_resolves_to_semiannual() -> None:
    eng = _engine()
    dates = _dates_with_gaps(datetime(2026, 1, 1, tzinfo=UTC), [269, 270])
    freq, _, _ = eng._detect_frequency(dates)
    assert freq == RecurrenceFrequency.SEMIANNUAL


# ─── Sanity: classic cadences still resolve correctly ───────────────────


def test_weekly_classic_7_day_cadence() -> None:
    eng = _engine()
    dates = _dates_with_gaps(datetime(2026, 1, 1, tzinfo=UTC), [7, 7, 7])
    freq, conf, _ = eng._detect_frequency(dates)
    assert freq == RecurrenceFrequency.WEEKLY
    assert conf == 100  # zero std -> max confidence


def test_monthly_classic_30_day_cadence() -> None:
    eng = _engine()
    dates = _dates_with_gaps(datetime(2026, 1, 1, tzinfo=UTC), [30, 30, 30])
    freq, _, _ = eng._detect_frequency(dates)
    assert freq == RecurrenceFrequency.MONTHLY


def test_yearly_classic_365_day_cadence() -> None:
    eng = _engine()
    dates = _dates_with_gaps(datetime(2026, 1, 1, tzinfo=UTC), [365, 365, 365])
    freq, _, _ = eng._detect_frequency(dates)
    assert freq == RecurrenceFrequency.YEARLY


# ─── Skip folding: regular cadences with skipped periods ─────────────────


def test_monthly_with_minority_skips_high_confidence() -> None:
    """Monthly stream with two skipped months stays MONTHLY at high confidence.

    Gaps [31, 30, 59, 31, 61, 30]: median 31 bands MONTHLY; the two doubled
    gaps fold to 2x the median instead of exploding the jitter term.
    """
    eng = _engine()
    dates = _dates_with_gaps(datetime(2026, 1, 1, tzinfo=UTC), [31, 30, 59, 31, 61, 30])
    freq, conf, _ = eng._detect_frequency(dates)
    assert freq == RecurrenceFrequency.MONTHLY
    assert conf >= 80


def test_long_monthly_stream_with_folded_skips() -> None:
    """A 16-gap wifi-bill-like stream with three skipped months scores >= 90."""
    eng = _engine()
    gaps = [30, 31, 30, 61, 30, 31, 61, 31, 30, 31, 61, 30, 31, 30, 31, 30]
    dates = _dates_with_gaps(datetime(2025, 1, 1, tzinfo=UTC), gaps)
    freq, conf, _ = eng._detect_frequency(dates)
    assert freq == RecurrenceFrequency.MONTHLY
    assert conf >= 90


def test_semiannual_with_one_skip() -> None:
    """Semiannual stream with one skipped period: previously QUARTERLY conf 0."""
    eng = _engine()
    dates = _dates_with_gaps(datetime(2024, 1, 1, tzinfo=UTC), [139, 278, 140])
    freq, conf, _ = eng._detect_frequency(dates)
    assert freq == RecurrenceFrequency.SEMIANNUAL
    assert conf >= 90


def test_below_minimum_returns_none() -> None:
    """Sub-weekly gaps (avg < 4) still return None -- not a tracked cadence."""
    eng = _engine()
    dates = _dates_with_gaps(datetime(2026, 1, 1, tzinfo=UTC), [1, 2, 1])
    freq, _, _ = eng._detect_frequency(dates)
    assert freq is None


def test_above_yearly_returns_none() -> None:
    """Gaps > 400 days are out of scope (not expected for personal finance)."""
    eng = _engine()
    dates = _dates_with_gaps(datetime(2026, 1, 1, tzinfo=UTC), [500, 500])
    freq, _, _ = eng._detect_frequency(dates)
    assert freq is None
