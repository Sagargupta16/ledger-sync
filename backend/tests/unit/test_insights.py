"""Unit tests for the written-insight engine in ``core/insights.py``.

The engine had no coverage at all, and three defect classes were sitting in it:

1. **A hardcoded rupee sign** in nine f-strings, so a user whose display
   currency is not INR read every figure under the wrong symbol.
2. **The month in progress leaking into rates.** ``group_by_month`` returns
   every month including the one currently running, and the volatility score,
   the recent-window trend and the best-month ranking all treated that stub as a
   complete observation. Same defect class as the Income Analysis page, where a
   partial July turned a true +18.1% growth rate into -95.6%.
3. **A hardcoded window in user-facing copy** ("your last 3 months") beside a
   ``RECENT_MONTHS_WINDOW`` constant that a tweak would desynchronise.

So the tests are organised around behaviour rather than methods: every
threshold branch on both sides, the empty-input early returns, and -- for the
partial-month split -- one dataset per contaminated figure where the correct and
the contaminated answers are DIFFERENT insights, not merely different numbers.

The reference date is injected (``today=REFERENCE``); nothing here reads the
real clock.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

from ledger_sync.core import insight_generators_time
from ledger_sync.core.insight_generators import category_insights, spending_insights
from ledger_sync.core.insight_generators_time import behavioral_insights, temporal_insights
from ledger_sync.core.insight_rules import (
    DEFAULT_CURRENCY_SYMBOL,
    INSIGHT_SEVERITIES,
    RECENT_MONTHS_WINDOW,
    completed_month_expenses,
    completed_monthly_data,
    is_partial_month,
    month_key,
)
from ledger_sync.core.insights import InsightEngine, resolve_currency_symbol
from ledger_sync.db.models import Transaction, TransactionType

# 26 July 2026: July has 31 days, so 2026-07 is the month in progress and
# 2026-06 and earlier are complete.
REFERENCE = date(2026, 7, 26)
RUPEE = "₹"


def tx(
    amount: float | str,
    when: datetime,
    kind: TransactionType = TransactionType.EXPENSE,
    category: str = "Groceries",
) -> Transaction:
    """Build an in-memory Transaction for insight tests."""
    return Transaction(
        amount=Decimal(str(amount)),
        type=kind,
        date=when,
        category=category,
        account="Everyday",
        from_account=None,
        to_account=None,
        currency="INR",
        subcategory="",
        note="",
    )


def on(year: int, month: int, day: int = 15) -> datetime:
    """A tz-aware instant, matching the convention in ``test_calculator.py``."""
    return datetime(year, month, day, tzinfo=UTC)


def monthly_expenses(
    months: list[int],
    amount: float,
    year: int = 2026,
    category: str = "Groceries",
) -> list[Transaction]:
    """One expense of *amount* in each listed month of *year*."""
    return [tx(amount, on(year, m), category=category) for m in months]


class _Prefs:
    """Stand-in for the single ``UserPreferences`` attribute the engine reads."""

    def __init__(self, currency_symbol: str | None) -> None:
        self.currency_symbol = currency_symbol


# ─── datasets ───────────────────────────────────────────────────────────
#
# Each is named for the branch it exercises. They are reused by the
# currency-symbol sweep at the bottom, which needs every emit site to fire.

# Two steady complete months plus a 1,000 stub in the month in progress.
VOLATILITY_FLIP = [
    *monthly_expenses([5, 6], 100_000),
    tx(1_000, on(2026, 7, 10)),
]

# Two complete months, genuinely 100x apart.
HIGH_VOLATILITY = [tx(100_000, on(2026, 5)), tx(1_000, on(2026, 6))]

# Six complete months stepping from 50k to 150k, plus one income row so the
# best month has a real surplus.
TREND_UP = [
    *monthly_expenses([1, 2, 3], 50_000),
    *monthly_expenses([4, 5, 6], 150_000),
    tx(200_000, on(2026, 6, 28), kind=TransactionType.INCOME, category="Employment Income"),
]

# Six flat complete months plus a stub in the month in progress. Flat means no
# trend at all -- unless the stub is counted, which manufactures one.
FLAT_PLUS_PARTIAL = [
    *monthly_expenses([1, 2, 3, 4, 5, 6], 100_000),
    tx(1_000, on(2026, 7, 10)),
]

# Six complete months stepping down from 150k to 50k.
TREND_DOWN = [
    *monthly_expenses([1, 2, 3], 150_000),
    *monthly_expenses([4, 5, 6], 50_000),
]

# Top category at 35% (below the concentration threshold) but discretionary at
# 35% (above the convenience threshold), so the two branches are isolated.
CONVENIENCE_ONLY = [
    tx(350, on(2026, 6), category="Food & Dining"),
    tx(300, on(2026, 6), category="Rent"),
    tx(200, on(2026, 6), category="Utilities"),
    tx(150, on(2026, 6), category="Transport"),
]

# Nothing crosses either category threshold.
CATEGORY_QUIET = [
    tx(300, on(2026, 6), category="Rent"),
    tx(300, on(2026, 6), category="Utilities"),
    tx(200, on(2026, 6), category="Transport"),
    tx(200, on(2026, 6), category="Health"),
]

# A user whose only history is the month in progress.
PARTIAL_ONLY = [tx(5_000, on(2026, 7, 5)), tx(3_000, on(2026, 7, 20))]

# Every row inside the 30-day velocity window, so there is no history to
# compare against.
NO_VELOCITY_HISTORY = [tx(5_000, on(2026, 5, 20)), tx(3_000, on(2026, 6, 10))]

ALL_DATASETS = [
    ("volatility_flip", VOLATILITY_FLIP),
    ("high_volatility", HIGH_VOLATILITY),
    ("trend_up", TREND_UP),
    ("flat_plus_partial", FLAT_PLUS_PARTIAL),
    ("trend_down", TREND_DOWN),
    ("convenience_only", CONVENIENCE_ONLY),
    ("category_quiet", CATEGORY_QUIET),
    ("partial_only", PARTIAL_ONLY),
    ("no_velocity_history", NO_VELOCITY_HISTORY),
]

EVERY_TITLE = {
    "High Spending Volatility",
    "Consistent Spending Pattern",
    "Average Daily Spending",
    "High Category Concentration",
    "Significant Convenience Spending",
    "Spending Trending Upward",
    "Spending Trending Downward",
    "Best Financial Month",
    "Lifestyle Inflation Detected",
    "Spending Reduction",
    "Accelerated Recent Spending",
    "Reduced Recent Spending",
}


def titles(insights: list[dict[str, str]]) -> set[str]:
    return {i["title"] for i in insights}


def described(insights: list[dict[str, str]], title: str) -> str:
    """The description of the one insight with *title*."""
    matches = [i["description"] for i in insights if i["title"] == title]
    assert len(matches) == 1, f"expected exactly one {title!r}, got {len(matches)}"
    return matches[0]


# ─── calendar rules ─────────────────────────────────────────────────────


def test_month_key_zero_pads_to_match_group_by_month() -> None:
    assert month_key(date(2026, 7, 5)) == "2026-07"
    assert month_key(datetime(2026, 12, 31, tzinfo=UTC)) == "2026-12"


def test_only_the_current_month_is_partial() -> None:
    assert is_partial_month("2026-07", REFERENCE) is True
    assert is_partial_month("2026-06", REFERENCE) is False
    assert is_partial_month("2026-08", REFERENCE) is False


def test_the_last_day_of_a_month_is_complete() -> None:
    """Dropping it on the 31st would delete a whole real month from the trend."""
    assert is_partial_month("2026-07", date(2026, 7, 31)) is False
    assert is_partial_month("2026-07", date(2026, 7, 30)) is True


def test_completed_monthly_data_drops_only_the_partial_month() -> None:
    data = {
        "2026-06": {"income": 1.0, "expenses": 2.0},
        "2026-07": {"income": 3.0, "expenses": 4.0},
    }
    assert set(completed_monthly_data(data, REFERENCE)) == {"2026-06"}


def test_completed_monthly_data_can_return_nothing() -> None:
    data = {"2026-07": {"income": 1.0, "expenses": 2.0}}
    assert completed_monthly_data(data, REFERENCE) == {}


def test_completed_month_expenses_filters_type_and_month() -> None:
    rows = [
        tx(100, on(2026, 6)),
        tx(200, on(2026, 7, 10)),
        tx(300, on(2026, 6), kind=TransactionType.INCOME),
    ]
    kept = completed_month_expenses(rows, REFERENCE)
    assert [float(t.amount) for t in kept] == [100.0]


# ─── currency symbol: the one central mechanism ─────────────────────────


def test_default_symbol_when_no_preferences() -> None:
    assert resolve_currency_symbol(None) == DEFAULT_CURRENCY_SYMBOL


def test_empty_symbol_falls_back_rather_than_rendering_bare_digits() -> None:
    assert resolve_currency_symbol(_Prefs("")) == DEFAULT_CURRENCY_SYMBOL
    assert resolve_currency_symbol(_Prefs(None)) == DEFAULT_CURRENCY_SYMBOL


def test_configured_symbol_is_used() -> None:
    assert resolve_currency_symbol(_Prefs("$")) == "$"


@pytest.mark.parametrize(("name", "transactions"), ALL_DATASETS)
def test_no_dataset_leaks_the_default_symbol_for_a_usd_user(
    name: str,
    transactions: list[Transaction],
) -> None:
    """The whole point of threading the symbol: zero rupee signs anywhere."""
    insights = InsightEngine(_Prefs("$"), today=REFERENCE).generate_all_insights(transactions)
    for insight in insights:
        assert RUPEE not in insight["description"], f"{name}: {insight['title']}"
        assert RUPEE not in insight["title"]


def test_the_datasets_between_them_reach_every_emit_site() -> None:
    """Guards the sweep above: it only proves anything if every site fires."""
    seen: set[str] = set()
    for _name, transactions in ALL_DATASETS:
        seen |= titles(InsightEngine(today=REFERENCE).generate_all_insights(transactions))
    assert seen == EVERY_TITLE


@pytest.mark.parametrize("symbol", ["$", "€", "£", "AED "])
def test_every_amount_carries_the_configured_symbol(symbol: str) -> None:
    """Each of the amount-bearing insights, under a non-default symbol."""
    engine = InsightEngine(_Prefs(symbol), today=REFERENCE)
    combined = " ".join(i["description"] for i in engine.generate_all_insights(TREND_UP))
    # Average daily (x2), concentration, trend, best month, velocity.
    assert combined.count(symbol) == 6
    assert RUPEE not in combined


def test_default_engine_still_renders_the_rupee_for_an_unconfigured_user() -> None:
    insights = InsightEngine(today=REFERENCE).generate_all_insights(HIGH_VOLATILITY)
    assert RUPEE in described(insights, "Average Daily Spending")


# ─── endpoint compatibility (analytics.py builds InsightEngine()) ────────


def test_engine_constructs_with_no_arguments() -> None:
    """The no-preferences shape stays supported.

    The router now passes the user's row (see
    ``tests/integration/test_generated_insights_currency.py``), but the argument
    is optional and CLI/tooling paths still construct the engine bare.
    """
    engine = InsightEngine()
    assert engine.generate_all_insights([]) == []


def test_generate_all_insights_takes_one_positional_argument() -> None:
    assert InsightEngine().generate_all_insights(HIGH_VOLATILITY)


def test_empty_transactions_produce_no_insights() -> None:
    assert InsightEngine(today=REFERENCE).generate_all_insights([]) == []


def test_income_only_ledger_produces_no_expense_insights() -> None:
    """Every expense generator early-returns; the surplus ranking still fires."""
    rows = [
        tx(100_000, on(2026, m), kind=TransactionType.INCOME, category="Employment Income")
        for m in (4, 5, 6)
    ]
    insights = InsightEngine(today=REFERENCE).generate_all_insights(rows)
    assert titles(insights) == {"Best Financial Month"}


# ─── spending insights ──────────────────────────────────────────────────


def test_high_volatility_branch() -> None:
    insights = spending_insights(HIGH_VOLATILITY, "$", REFERENCE)
    assert "High Spending Volatility" in titles(insights)
    assert [i["severity"] for i in insights if i["title"] == "High Spending Volatility"] == ["info"]


def test_steady_branch() -> None:
    insights = spending_insights(monthly_expenses([5, 6], 100_000), "$", REFERENCE)
    assert "Consistent Spending Pattern" in titles(insights)


def test_mid_band_consistency_emits_neither_branch() -> None:
    """Score lands between the two thresholds -- only the daily rate is left."""
    rows = [tx(50_000, on(2026, 5)), tx(150_000, on(2026, 6))]
    assert titles(spending_insights(rows, "$", REFERENCE)) == {"Average Daily Spending"}


def test_the_month_in_progress_does_not_create_volatility() -> None:
    """The headline partial-month defect, on the volatility path.

    Two steady 100,000 months plus a 1,000 stub for the month in progress. Over
    completed months the score is a perfect 100 and the user is told their
    spending is predictable; counting the stub drops the score to ~30 and
    publishes the opposite conclusion.
    """
    insights = spending_insights(VOLATILITY_FLIP, "$", REFERENCE)
    assert "Consistent Spending Pattern" in titles(insights)
    assert "High Spending Volatility" not in titles(insights)


def test_a_single_complete_month_abstains_from_volatility() -> None:
    """A one-month coefficient of variation is not a measurement.

    ``calculate_consistency_score`` returns a flat 100.0 sentinel there, which
    read as data would announce "very predictable / good budget control" off one
    month of history.
    """
    rows = [*monthly_expenses([6], 100_000), tx(1_000, on(2026, 7, 10))]
    assert titles(spending_insights(rows, "$", REFERENCE)) == {"Average Daily Spending"}


def test_only_the_month_in_progress_abstains_from_volatility() -> None:
    assert titles(spending_insights(PARTIAL_ONLY, "$", REFERENCE)) == {"Average Daily Spending"}


def test_all_zero_expenses_abstain_from_volatility() -> None:
    """A zero mean also returns the 100.0 sentinel, not a real score."""
    rows = [tx(0, on(2026, 5)), tx(0, on(2026, 6))]
    assert titles(spending_insights(rows, "$", REFERENCE)) == {"Average Daily Spending"}


def test_daily_rate_is_always_reported_and_projects_the_month() -> None:
    """4,000 over 2 days is 2,000/day; the monthly figure scales by 30.44."""
    rows = [tx(2_000, on(2026, 6, 1)), tx(2_000, on(2026, 6, 2))]
    text = described(spending_insights(rows, "$", REFERENCE), "Average Daily Spending")
    assert "$2,000" in text
    assert "$60,880" in text


def test_spending_insights_ignore_income_and_transfers() -> None:
    rows = [
        tx(1_000, on(2026, 6), kind=TransactionType.INCOME),
        tx(1_000, on(2026, 6), kind=TransactionType.TRANSFER),
    ]
    assert spending_insights(rows, "$", REFERENCE) == []


# ─── category insights ──────────────────────────────────────────────────


def test_concentration_branch_names_the_top_category_and_amount() -> None:
    rows = [tx(900, on(2026, 6), category="Rent"), tx(100, on(2026, 6), category="Transport")]
    text = described(category_insights(rows, "$", REFERENCE), "High Category Concentration")
    assert "'Rent'" in text
    assert "90.0%" in text
    assert "$900" in text


def test_convenience_branch_alone() -> None:
    insights = category_insights(CONVENIENCE_ONLY, "$", REFERENCE)
    assert titles(insights) == {"Significant Convenience Spending"}
    assert "35.0%" in described(insights, "Significant Convenience Spending")


def test_neither_category_threshold_crossed() -> None:
    assert category_insights(CATEGORY_QUIET, "$", REFERENCE) == []


def test_category_insights_empty_expenses() -> None:
    assert category_insights([], "$", REFERENCE) == []
    assert (
        category_insights([tx(1, on(2026, 6), kind=TransactionType.INCOME)], "$", REFERENCE) == []
    )


def test_category_totals_include_the_month_in_progress() -> None:
    """Shares of a period total, not rates -- money already spent counts."""
    insights = category_insights(PARTIAL_ONLY, "$", REFERENCE)
    assert "$8,000" in described(insights, "High Category Concentration")


# ─── temporal insights ──────────────────────────────────────────────────


def test_trend_up_branch() -> None:
    insights = temporal_insights(TREND_UP, "$", REFERENCE)
    text = described(insights, "Spending Trending Upward")
    assert "$150,000" in text
    assert "50.0% higher" in text
    assert [i["severity"] for i in insights if i["title"] == "Spending Trending Upward"] == [
        "warning"
    ]


def test_trend_down_branch() -> None:
    text = described(temporal_insights(TREND_DOWN, "$", REFERENCE), "Spending Trending Downward")
    assert "$50,000" in text
    assert "50.0% lower" in text


def test_flat_spending_emits_no_trend() -> None:
    rows = monthly_expenses([1, 2, 3, 4, 5, 6], 100_000)
    assert "Spending Trending Upward" not in titles(temporal_insights(rows, "$", REFERENCE))
    assert "Spending Trending Downward" not in titles(temporal_insights(rows, "$", REFERENCE))


def test_the_month_in_progress_does_not_manufacture_a_downward_trend() -> None:
    """The headline partial-month defect, on the trend path.

    Six flat 100,000 months and a 1,000 stub for the month in progress. Over
    completed months the recent average equals the overall average exactly, so
    there is no trend to report; counting the stub pulls the recent window to
    67,000 against 85,857 -- ratio 0.78, under the 0.8 threshold -- and
    congratulates the user on a spending reduction they have not made.
    """
    assert titles(temporal_insights(FLAT_PLUS_PARTIAL, "$", REFERENCE)) == set()


def test_fewer_complete_months_than_the_window_emits_no_trend() -> None:
    rows = [*monthly_expenses([5, 6], 100_000), tx(500_000, on(2026, 7, 10))]
    assert "Spending Trending Upward" not in titles(temporal_insights(rows, "$", REFERENCE))
    assert "Spending Trending Downward" not in titles(temporal_insights(rows, "$", REFERENCE))


def test_the_recent_window_text_tracks_the_constant(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Copy must interpolate the window, not hardcode today's value of it."""
    monkeypatch.setattr(insight_generators_time, "RECENT_MONTHS_WINDOW", 2)
    rows = [*monthly_expenses([4, 5], 50_000), *monthly_expenses([6], 200_000)]
    text = described(temporal_insights(rows, "$", REFERENCE), "Spending Trending Upward")
    assert "last 2 months average" in text
    assert "last 3 months" not in text


def test_the_default_window_text_matches_the_default_constant() -> None:
    text = described(temporal_insights(TREND_UP, "$", REFERENCE), "Spending Trending Upward")
    assert f"last {RECENT_MONTHS_WINDOW} months average" in text


def test_best_month_branch() -> None:
    insights = temporal_insights(TREND_UP, "$", REFERENCE)
    text = described(insights, "Best Financial Month")
    assert "2026-06" in text
    assert "$50,000" in text


def test_the_month_in_progress_cannot_be_the_best_month() -> None:
    """Expenses land through the month; income may already have landed.

    2026-07 shows a 98,000 "surplus" purely because most of its spending has not
    happened yet, which outranks every real month.
    """
    rows = [
        tx(100_000, on(2026, 5, 28), kind=TransactionType.INCOME, category="Employment Income"),
        tx(90_000, on(2026, 5, 10)),
        tx(100_000, on(2026, 6, 28), kind=TransactionType.INCOME, category="Employment Income"),
        tx(95_000, on(2026, 6, 10)),
        tx(100_000, on(2026, 7, 1), kind=TransactionType.INCOME, category="Employment Income"),
        tx(2_000, on(2026, 7, 20)),
    ]
    text = described(temporal_insights(rows, "$", REFERENCE), "Best Financial Month")
    assert "2026-05" in text
    assert "2026-07" not in text


def test_an_all_deficit_ledger_reports_no_best_month() -> None:
    """A deficit is not a surplus -- the label and the sign must agree."""
    rows = monthly_expenses([4, 5, 6], 100_000)
    assert "Best Financial Month" not in titles(temporal_insights(rows, "$", REFERENCE))


def test_only_the_month_in_progress_reports_nothing_temporal() -> None:
    assert temporal_insights(PARTIAL_ONLY, "$", REFERENCE) == []


def test_temporal_insights_empty_input() -> None:
    assert temporal_insights([], "$", REFERENCE) == []


def test_zero_expense_months_do_not_divide_by_zero() -> None:
    """Three complete months of zero expenses: no trend, no ZeroDivisionError."""
    rows = monthly_expenses([4, 5, 6], 0)
    assert temporal_insights(rows, "$", REFERENCE) == []


# ─── behavioral insights ────────────────────────────────────────────────


def test_lifestyle_inflation_branch() -> None:
    text = described(behavioral_insights(TREND_UP, "$", REFERENCE), "Lifestyle Inflation Detected")
    assert "200.0%" in text


def test_spending_reduction_branch() -> None:
    text = described(behavioral_insights(TREND_DOWN, "$", REFERENCE), "Spending Reduction")
    assert "66.7%" in text


def test_stable_spending_emits_neither_inflation_branch() -> None:
    rows = monthly_expenses([1, 2, 3, 4, 5, 6], 100_000)
    assert "Lifestyle Inflation Detected" not in titles(behavioral_insights(rows, "$", REFERENCE))
    assert "Spending Reduction" not in titles(behavioral_insights(rows, "$", REFERENCE))


def test_the_month_in_progress_does_not_hide_lifestyle_inflation() -> None:
    """The headline partial-month defect, on the window-comparison path.

    Three months at 100,000 then three at 150,000 is a real 50% escalation. Let
    the 1,000 stub for the month in progress into the late window and its
    average collapses to 100,333 -- a 0.3% change, so the insight vanishes.
    """
    rows = [
        *monthly_expenses([1, 2, 3], 100_000),
        *monthly_expenses([4, 5, 6], 150_000),
        tx(1_000, on(2026, 7, 10)),
    ]
    text = described(behavioral_insights(rows, "$", REFERENCE), "Lifestyle Inflation Detected")
    assert "50.0%" in text


def test_velocity_up_branch() -> None:
    insights = behavioral_insights(TREND_UP, "$", REFERENCE)
    assert "Accelerated Recent Spending" in titles(insights)
    assert "higher" in described(insights, "Accelerated Recent Spending")


def test_velocity_down_branch() -> None:
    insights = behavioral_insights(VOLATILITY_FLIP, "$", REFERENCE)
    assert "lower" in described(insights, "Reduced Recent Spending")


def test_no_velocity_history_abstains_instead_of_claiming_a_full_reduction() -> None:
    """``velocity_ratio`` is 0.0 when there is no history to compare against.

    Read as a value it trips the 0.7 down-threshold and tells a user whose whole
    ledger sits inside the recent window that their spending is "100.0% lower
    than your historical average".
    """
    insights = behavioral_insights(NO_VELOCITY_HISTORY, "$", REFERENCE)
    assert "Reduced Recent Spending" not in titles(insights)
    assert all("100.0% lower" not in i["description"] for i in insights)


def test_velocity_in_the_dead_band_emits_neither_branch() -> None:
    """Ratio near 1.0: recent pace matches history, so there is nothing to say."""
    rows = [tx(1_000, on(2026, 5, d)) for d in (1, 11, 21)] + [
        tx(1_000, on(2026, 6, d)) for d in (5, 15, 25)
    ]
    assert "Accelerated Recent Spending" not in titles(behavioral_insights(rows, "$", REFERENCE))
    assert "Reduced Recent Spending" not in titles(behavioral_insights(rows, "$", REFERENCE))


def test_behavioral_insights_empty_expenses() -> None:
    assert behavioral_insights([], "$", REFERENCE) == []
    assert (
        behavioral_insights([tx(1, on(2026, 6), kind=TransactionType.INCOME)], "$", REFERENCE) == []
    )


def test_only_the_month_in_progress_reports_no_inflation() -> None:
    insights = behavioral_insights(PARTIAL_ONLY, "$", REFERENCE)
    assert "Lifestyle Inflation Detected" not in titles(insights)
    assert "Spending Reduction" not in titles(insights)


# ─── generate_all_insights ──────────────────────────────────────────────


def test_generate_all_insights_concatenates_every_generator() -> None:
    insights = InsightEngine(_Prefs("$"), today=REFERENCE).generate_all_insights(TREND_UP)
    assert titles(insights) == {
        "Average Daily Spending",
        "High Category Concentration",
        "Spending Trending Upward",
        "Best Financial Month",
        "Lifestyle Inflation Detected",
        "Accelerated Recent Spending",
    }


@pytest.mark.parametrize(("name", "transactions"), ALL_DATASETS)
def test_every_insight_has_exactly_the_three_documented_keys(
    name: str,
    transactions: list[Transaction],
) -> None:
    for insight in InsightEngine(today=REFERENCE).generate_all_insights(transactions):
        assert set(insight) == {"title", "description", "severity"}, name


@pytest.mark.parametrize(("name", "transactions"), ALL_DATASETS)
def test_severity_vocabulary_is_self_consistent(
    name: str,
    transactions: list[Transaction],
) -> None:
    """No generator may invent a severity no consumer can style."""
    for insight in InsightEngine(today=REFERENCE).generate_all_insights(transactions):
        assert insight["severity"] in INSIGHT_SEVERITIES, f"{name}: {insight['title']}"


def test_the_whole_severity_vocabulary_is_actually_reachable() -> None:
    """Guards the check above: an unused member would make it vacuous."""
    seen: set[str] = set()
    for _name, transactions in ALL_DATASETS:
        seen |= {
            i["severity"]
            for i in InsightEngine(today=REFERENCE).generate_all_insights(transactions)
        }
    assert seen == set(INSIGHT_SEVERITIES)


def test_engine_defaults_today_to_the_ledger_clock() -> None:
    """No argument must still resolve a reference date, not crash or use None."""
    engine = InsightEngine()
    assert isinstance(engine._today, date)


# ─── generate_monthly_summary ───────────────────────────────────────────


def test_monthly_summary_totals_and_savings_rate() -> None:
    rows = [
        tx(100_000, on(2026, 6, 28), kind=TransactionType.INCOME, category="Employment Income"),
        tx(30_000, on(2026, 6, 5), category="Rent"),
        tx(10_000, on(2026, 6, 12), category="Groceries"),
    ]
    summary = InsightEngine.generate_monthly_summary(rows, "2026-06")
    assert summary["month"] == "2026-06"
    assert summary["total_income"] == pytest.approx(100_000.0)
    assert summary["total_expenses"] == pytest.approx(40_000.0)
    assert summary["surplus"] == pytest.approx(60_000.0)
    assert summary["transaction_count"] == 3
    assert summary["expense_count"] == 2
    assert summary["savings_rate"] == pytest.approx(60.0)


def test_monthly_summary_top_categories_are_sorted_desc() -> None:
    rows = [
        tx(100, on(2026, 6), category="Transport"),
        tx(900, on(2026, 6), category="Rent"),
        tx(500, on(2026, 6), category="Groceries"),
    ]
    summary = InsightEngine.generate_monthly_summary(rows, "2026-06")
    assert [c["category"] for c in summary["top_categories"]] == ["Rent", "Groceries", "Transport"]
    assert summary["top_categories"][0]["amount"] == pytest.approx(900.0)


def test_monthly_summary_caps_top_categories_at_five() -> None:
    rows = [tx(100 * i, on(2026, 6), category=f"Category {i}") for i in range(1, 9)]
    summary = InsightEngine.generate_monthly_summary(rows, "2026-06")
    assert len(summary["top_categories"]) == 5
    assert [c["category"] for c in summary["top_categories"]] == [
        "Category 8",
        "Category 7",
        "Category 6",
        "Category 5",
        "Category 4",
    ]


def test_monthly_summary_empty_month() -> None:
    summary = InsightEngine.generate_monthly_summary([], "2026-07")
    assert summary["total_income"] == pytest.approx(0.0)
    assert summary["total_expenses"] == pytest.approx(0.0)
    assert summary["transaction_count"] == 0
    assert summary["top_categories"] == []
    assert summary["savings_rate"] == pytest.approx(0.0)


def test_monthly_summary_zero_income_does_not_divide_by_zero() -> None:
    summary = InsightEngine.generate_monthly_summary([tx(500, on(2026, 6))], "2026-06")
    assert summary["savings_rate"] == pytest.approx(0.0)
    assert summary["surplus"] == pytest.approx(-500.0)


def test_monthly_summary_ignores_transfers_in_the_money_totals() -> None:
    rows = [tx(5_000, on(2026, 6), kind=TransactionType.TRANSFER)]
    summary = InsightEngine.generate_monthly_summary(rows, "2026-06")
    assert summary["total_expenses"] == pytest.approx(0.0)
    assert summary["transaction_count"] == 1
    assert summary["expense_count"] == 0
