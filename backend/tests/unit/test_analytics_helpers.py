from ledger_sync.core._analytics_helpers import infer_expected_day_of_month


def test_infer_returns_none_for_empty():
    assert infer_expected_day_of_month([]) is None


def test_single_day():
    assert infer_expected_day_of_month([15]) == 15


def test_consistent_mid_month_uses_median():
    # Bills on the 15th, always clean
    assert infer_expected_day_of_month([15, 15, 15, 15]) == 15


def test_late_month_clamping_returns_max():
    # 31st bill clamped to 28/30 in shorter months -- max recovers true intent
    assert infer_expected_day_of_month([31, 28, 31, 30, 31]) == 31


def test_28th_bill_feb_clamp():
    # 28th bill, Feb leap/non-leap edge cases
    assert infer_expected_day_of_month([28, 28, 28, 28]) == 28


def test_occasional_drift_mid_month_robust():
    # 5th bill, one-day weekend drift on 4th or 6th -- median is robust
    assert infer_expected_day_of_month([5, 5, 4, 5, 6, 5]) == 5


def test_first_of_month_outlier_from_end_of_month():
    # 28th bill that occasionally posts on 1st of next month: max still returns 28
    assert infer_expected_day_of_month([28, 1, 28, 28, 1]) == 28


def test_mid_month_even_count_uses_lower_median():
    # Mix of 10 and 12 with no clear mode
    assert infer_expected_day_of_month([10, 12]) == 10


def test_day_one_bill_with_late_month_outliers():
    # Regression: a day-1 bill (23x on the 1st) with sparse late-month noise must
    # stay 1, not get pulled to 31 by the old "max>=25 -> max" rule.
    days = [1] * 23 + [5, 16, 17, 30, 30, 30, 31]
    assert infer_expected_day_of_month(days) == 1


def test_salary_clustered_on_27th_with_stray_late_days():
    # Salary mostly on the 27th (mode), occasional 28/31 -- should return 27.
    days = [27] * 7 + [28] * 5 + [31]
    assert infer_expected_day_of_month(days) == 27
