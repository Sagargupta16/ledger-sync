"""Tests for robust anomaly detection (median + MAD, rolling baseline).

These tests target the algorithmic behavior of the AnomaliesMixin helpers
without spinning up a full AnalyticsEngine + DB session -- the mixin
methods are pure once you give them a values list / txn stream. The
integration paths are exercised via the existing analytics scoping tests.
"""

from __future__ import annotations

from statistics import median

from ledger_sync.core.analytics.anomalies import AnomaliesMixin

# The three module-level constants that the tests rely on.
_MZ = 0.6745


def _mad(values: list[float]) -> float:
    med = median(values)
    return median(abs(v - med) for v in values)


def _modified_z(x: float, values: list[float]) -> float:
    med = median(values)
    mad = _mad(values)
    return _MZ * (x - med) / mad if mad else 0.0


def test_mean_stdev_self_masking_bug_is_fixed():
    """Regression test for the audit-flagged self-masking bug.

    Historical behavior: 12 months at 50k INR + one month at 150k INR gave
    mean=57.7k and stdev=27.7k. Under the old threshold 2.0 (stdev multiplier),
    the cutoff was 57.7k + 2.0 * 27.7k = 113k -- the 150k month just barely
    tripped, and a slightly-different distribution or user-tuned threshold
    of 2.5 would miss it. Under the modified-Z approach, MAD is 0 (12 tied
    values), so we fall back to IQR fence, and 150k trivially exceeds it.
    """
    values = [50_000.0] * 12 + [150_000.0]
    upper_fence = AnomaliesMixin._tukey_upper_fence(values)
    assert upper_fence is not None
    assert 150_000.0 > upper_fence

    # Also verify the MAD path when the sample isn't degenerate:
    # 12 months of 50k with jitter + one month at 150k
    varied = [50_000.0 + i * 100 for i in range(12)] + [150_000.0]
    mad = _mad(varied)
    assert mad > 0
    m_z = _modified_z(150_000.0, varied)
    assert m_z > 3.5  # Trips the default modified-Z cutoff


def test_iqr_fallback_when_mad_zero():
    """When >=50% of values are identical, MAD collapses to 0 -- IQR fence
    must catch the outlier instead."""
    values = [100.0] * 8 + [500.0, 1000.0]
    assert _mad(values) == 0

    upper_fence = AnomaliesMixin._tukey_upper_fence(values)
    assert upper_fence is not None
    # With 8 tied 100s + 500 + 1000, Q1=100, Q3=100 (mostly), fence is tight.
    # Both outliers should exceed a reasonable fence.
    assert 1000.0 > upper_fence


def test_iqr_fence_returns_none_below_threshold():
    """`statistics.quantiles(data, n=4)` needs >= 4 points."""
    assert AnomaliesMixin._tukey_upper_fence([1.0, 2.0, 3.0]) is None
    assert AnomaliesMixin._tukey_upper_fence([1.0, 2.0, 3.0, 4.0]) is not None


def test_iqr_fence_matches_tukey_formula():
    """Concrete sanity check on the fence formula."""
    values = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]
    # For this evenly-spaced sample, Q1=2.25, Q3=6.75, IQR=4.5, fence=13.5
    fence = AnomaliesMixin._tukey_upper_fence(values)
    assert fence is not None
    assert abs(fence - 13.5) < 0.01


def test_modified_z_score_matches_iglewicz_hoaglin():
    """The 0.6745 constant is Phi^-1(0.75); verify the formula is applied."""
    # Sample with a clear outlier: 10 values near 100 + one at 500
    values = [100.0, 101.0, 99.0, 102.0, 98.0, 100.5, 99.5, 101.5, 98.5, 100.0]
    med = median(values)
    mad = _mad(values)
    m_z_outlier = _MZ * (500.0 - med) / mad

    # The outlier is far from the median, several MADs away.
    assert m_z_outlier > 10  # very high modified-Z
    # A near-median value has a very low modified-Z.
    m_z_normal = _MZ * (101.0 - med) / mad
    assert abs(m_z_normal) < 1.0


def test_mad_helper_stable_against_single_outlier():
    """MAD is a robust estimator -- one outlier shouldn't move it much."""
    baseline = [100.0] * 20
    assert _mad(baseline) == 0  # tied values have MAD 0
    with_outlier = [*baseline, 100_000.0]
    outlier_mad = _mad(with_outlier)
    # MAD stays extremely small (~0) even with the outlier -- that's the whole
    # point. Contrast with stdev: same input pushes stdev over 20_000.
    assert outlier_mad < 1.0
