"""Recurring ``next_expected`` -- month-length clamping regression tests.

``_compute_next_expected`` used to clamp a monthly pattern's ``expected_day``
with a flat ``min(expected_day, 28)``. A bill genuinely due on the 29th, 30th
or 31st was therefore reported as due on the 28th in every month long enough
to hold it, so the bill calendar showed the wrong date and the missed-payment
check fired up to three days early. Real data had 2 of 25 monthly patterns
sitting on ``expected_day = 31``.

These tests pin the calendar-correct behaviour: the day is clamped to the
TARGET month's real length, so it only moves when the month is genuinely
shorter.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from ledger_sync.api.analytics_v2_impl.recurring import _compute_next_expected


def _next(last: datetime, freq: str, day: int | None) -> datetime:
    """``_compute_next_expected`` as a datetime, asserting it resolved."""
    result = _compute_next_expected(last, freq, day)
    assert result is not None
    return datetime.fromisoformat(result)


class TestMonthlyDayClamping:
    """A monthly pattern lands on its real day whenever the month allows it."""

    @pytest.mark.parametrize(
        ("last", "expected_day", "want"),
        [
            # 31-day months keep the 31st. The old flat-28 clamp lost 3 days.
            (datetime(2026, 4, 30, tzinfo=UTC), 31, datetime(2026, 5, 31, tzinfo=UTC)),
            (datetime(2026, 6, 30, tzinfo=UTC), 31, datetime(2026, 7, 31, tzinfo=UTC)),
            (datetime(2026, 12, 25, tzinfo=UTC), 30, datetime(2027, 1, 30, tzinfo=UTC)),
            # 30-day months clamp to the 30th, not the 28th.
            (datetime(2026, 3, 31, tzinfo=UTC), 31, datetime(2026, 4, 30, tzinfo=UTC)),
            (datetime(2026, 3, 30, tzinfo=UTC), 30, datetime(2026, 4, 30, tzinfo=UTC)),
            # February is the one month where 28 was right by accident.
            (datetime(2026, 1, 31, tzinfo=UTC), 29, datetime(2026, 2, 28, tzinfo=UTC)),
            # A leap February holds the 29th.
            (datetime(2028, 1, 31, tzinfo=UTC), 31, datetime(2028, 2, 29, tzinfo=UTC)),
        ],
    )
    def test_clamps_to_target_month_length(
        self,
        last: datetime,
        expected_day: int,
        want: datetime,
    ) -> None:
        assert _next(last, "monthly", expected_day) == want

    def test_early_month_day_is_untouched(self) -> None:
        """A day every month can hold never moves."""
        assert _next(datetime(2026, 1, 5, tzinfo=UTC), "monthly", 5) == datetime(
            2026, 2, 5, tzinfo=UTC
        )

    def test_rolls_the_year_over(self) -> None:
        assert _next(datetime(2026, 12, 31, tzinfo=UTC), "monthly", 31) == datetime(
            2027, 1, 31, tzinfo=UTC
        )

    def test_always_returns_a_future_date(self) -> None:
        """The loop must advance past ``last_occurrence``, never land on it.

        A pattern last seen on the 5th with an expected day of 1 would otherwise
        resolve to a date earlier in the same month.
        """
        last = datetime(2026, 5, 5, tzinfo=UTC)
        assert _next(last, "monthly", 1) > last

    def test_preserves_the_time_of_day(self) -> None:
        """Only the date parts move; the clock component rides along."""
        last = datetime(2026, 4, 30, 9, 30, tzinfo=UTC)
        assert _next(last, "monthly", 31) == datetime(2026, 5, 31, 9, 30, tzinfo=UTC)


class TestOtherFrequencies:
    """Non-monthly cadences step by their fixed day count."""

    @pytest.mark.parametrize(
        ("freq", "days"),
        [
            ("daily", 1),
            ("weekly", 7),
            ("biweekly", 14),
            ("quarterly", 91),
            ("yearly", 365),
        ],
    )
    def test_steps_by_frequency_days(self, freq: str, days: int) -> None:
        last = datetime(2026, 3, 15, tzinfo=UTC)
        delta = _next(last, freq, None) - last
        assert delta.days == days

    def test_monthly_without_an_expected_day_falls_back_to_the_day_step(self) -> None:
        last = datetime(2026, 3, 15, tzinfo=UTC)
        assert (_next(last, "monthly", None) - last).days == 30

    def test_frequency_is_matched_case_insensitively(self) -> None:
        last = datetime(2026, 3, 15, tzinfo=UTC)
        assert _next(last, "MONTHLY", 20) == datetime(2026, 4, 20, tzinfo=UTC)


class TestMissingInputs:
    """No last occurrence or no frequency means no estimate."""

    def test_no_last_occurrence(self) -> None:
        assert _compute_next_expected(None, "monthly", 15) is None

    def test_no_frequency(self) -> None:
        assert _compute_next_expected(datetime(2026, 3, 15, tzinfo=UTC), None, 15) is None

    def test_unknown_frequency(self) -> None:
        assert (
            _compute_next_expected(datetime(2026, 3, 15, tzinfo=UTC), "fortnightly", None) is None
        )
