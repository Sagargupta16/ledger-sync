"""Commitment-vs-habit classification for detected recurring patterns.

Gap regularity cannot separate a bill from a habit: a daily lunch repeats as
reliably as rent. On the maintainer's 6,830-row ledger the note-keyed grouping
produced 77 "recurring" patterns and roughly half were meals -- "Egg Fried Rice"
(45 occurrences), "Milk Shake - Banana" (117) -- listed beside salary and rent,
so anything reading the list as fixed costs was wrong by construction.

``classify_pattern_kind`` adds two calendar tests a bill passes and a habit
fails: it anchors to a day of the month, and it bills once per period.
"""

from __future__ import annotations

from datetime import UTC, datetime

from ledger_sync.core._analytics_helpers import (
    classify_pattern_kind,
    day_of_month_anchor_share,
    duplicate_period_share,
)
from ledger_sync.db.models import RecurrenceFrequency


def _dates(*specs: tuple[int, int, int]) -> list[datetime]:
    return [datetime(y, m, d, tzinfo=UTC) for y, m, d in specs]


class TestDayOfMonthAnchorShare:
    def test_a_bill_on_a_fixed_day_scores_one(self) -> None:
        days = [1, 1, 1, 1, 1]
        assert day_of_month_anchor_share(days) == 1.0

    def test_tolerates_a_few_days_of_drift(self) -> None:
        # A 1st-of-month bill posting on the 2nd or 3rd is still anchored.
        assert day_of_month_anchor_share([1, 2, 3, 1, 2]) == 1.0

    def test_wraps_around_the_month_boundary(self) -> None:
        # A 1st-of-month bill that sometimes lands on the 30th/31st is anchored:
        # distance is circular, not arithmetic.
        assert day_of_month_anchor_share([31, 1, 2, 30]) == 1.0

    def test_scattered_days_score_low(self) -> None:
        # Bought whenever: no 7-day window holds most of the occurrences.
        assert day_of_month_anchor_share([2, 8, 14, 19, 25, 29]) < 0.6

    def test_empty_input_scores_zero(self) -> None:
        assert day_of_month_anchor_share([]) == 0.0


class TestDuplicatePeriodShare:
    def test_once_a_month_scores_zero(self) -> None:
        dates = _dates((2026, 1, 1), (2026, 2, 1), (2026, 3, 1))
        assert duplicate_period_share(dates) == 0.0

    def test_every_month_doubled_scores_one(self) -> None:
        dates = _dates((2026, 1, 4), (2026, 1, 20), (2026, 2, 3), (2026, 2, 19))
        assert duplicate_period_share(dates) == 1.0

    def test_reports_the_share_of_repeated_months(self) -> None:
        dates = _dates((2026, 1, 5), (2026, 1, 22), (2026, 2, 5), (2026, 3, 5))
        assert duplicate_period_share(dates) == 1 / 3

    def test_empty_input_scores_zero(self) -> None:
        assert duplicate_period_share([]) == 0.0


class TestClassifyPatternKind:
    def test_rent_on_the_first_is_a_commitment(self) -> None:
        dates = _dates((2026, 1, 1), (2026, 2, 1), (2026, 3, 1), (2026, 4, 1))
        assert classify_pattern_kind(dates, RecurrenceFrequency.MONTHLY) == "commitment"

    def test_salary_late_in_the_month_is_a_commitment(self) -> None:
        dates = _dates((2026, 1, 27), (2026, 2, 26), (2026, 3, 27), (2026, 4, 29))
        assert classify_pattern_kind(dates, RecurrenceFrequency.MONTHLY) == "commitment"

    def test_semiannual_fee_is_a_commitment(self) -> None:
        dates = _dates((2025, 1, 4), (2025, 7, 4), (2026, 1, 5))
        assert classify_pattern_kind(dates, RecurrenceFrequency.SEMIANNUAL) == "commitment"

    def test_weekly_cadence_is_always_a_habit(self) -> None:
        # No day-of-month anchor exists for a weekly stream, and on real data
        # every weekly-banded group was discretionary spending.
        dates = _dates((2026, 1, 6), (2026, 1, 13), (2026, 1, 20), (2026, 1, 27))
        assert classify_pattern_kind(dates, RecurrenceFrequency.WEEKLY) == "habit"

    def test_biweekly_cadence_is_a_habit(self) -> None:
        dates = _dates((2026, 1, 6), (2026, 1, 20), (2026, 2, 3), (2026, 2, 17))
        assert classify_pattern_kind(dates, RecurrenceFrequency.BIWEEKLY) == "habit"

    def test_monthly_median_but_scattered_days_is_a_habit(self) -> None:
        # A lunch bought about once a month, never on the same date: the median
        # gap bands as MONTHLY but nothing anchors it.
        dates = _dates((2026, 1, 3), (2026, 2, 12), (2026, 3, 24), (2026, 4, 8), (2026, 5, 19))
        assert classify_pattern_kind(dates, RecurrenceFrequency.MONTHLY) == "habit"

    def test_twice_in_most_months_is_a_habit(self) -> None:
        # Same day-of-month cluster, but bought twice a month: not a bill.
        dates = _dates(
            (2026, 1, 2),
            (2026, 1, 3),
            (2026, 2, 2),
            (2026, 2, 4),
            (2026, 3, 3),
            (2026, 3, 2),
        )
        assert classify_pattern_kind(dates, RecurrenceFrequency.MONTHLY) == "habit"

    def test_one_doubled_month_does_not_demote_a_bill(self) -> None:
        # An electricity bill with a single catch-up payment stays a commitment.
        dates = _dates(
            (2026, 1, 5),
            (2026, 1, 7),
            (2026, 2, 5),
            (2026, 3, 5),
            (2026, 4, 6),
            (2026, 5, 5),
        )
        assert classify_pattern_kind(dates, RecurrenceFrequency.MONTHLY) == "commitment"
