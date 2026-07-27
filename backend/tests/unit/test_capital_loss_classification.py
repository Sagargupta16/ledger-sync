"""Realised-capital-loss classification: keys, detection, and rollup effects.

A realised trading loss has to be booked as an ``EXPENSE`` for a cashbook's cash
column to balance, but it bought no goods or services -- it is a negative
investment return. Nothing sat between ``txn.type == EXPENSE`` and
``total_expenses += amount``, so one loss inflated the expense total, the
essential/discretionary split, ``savings_rate``, ``expense_ratio``, the category
ranking, the anomaly baseline and any budget on that category, all at once.

Measured on one real 6,961-row ledger: 4 EXPENSE rows totalling 216,985.85, or
5.43% of the 3,994,751 live expense total. The persisted December-2024 rollup
read a -180.1% savings rate where the consumption-only figure is -68.4%.

TWO THINGS THIS SUITE PINS DOWN, and they pull in opposite directions:

1. With ``capital_loss_categories`` EMPTY -- the shipped state -- every number is
   byte-identical to the pre-preference behaviour. No user's history moves on its
   own. ``test_*_unclassified_*`` cover this direction.
2. Once the user classifies a taxonomy, the loss leaves the consumption figures
   but still lowers ``net_savings``, because the cash really left and month-end
   wealth really is lower.

The detection layer (``looks_like_capital_loss``) is asserted to be SIGNAL ONLY:
it feeds ``/api/analytics/v2/data-health`` so the app can ask the user to
classify, and it must never be reachable from an aggregate. Silently rewriting a
user's transaction types is not a fix.

Fixtures use the taxonomies a real ledger carries (``Investment Expenses / F&O
Loss``, ``Stocks Market Loss``) plus invented ones in other spellings, because
the preference is exact-match and the detector must be spelling-agnostic. No
category or account name is hardcoded in the production module -- see
``core/expense_class.py``.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from ledger_sync.core.analytics.engine import AnalyticsEngine
from ledger_sync.core.expense_class import (
    capital_loss_keys,
    capital_loss_sql_filter,
    classification_key,
    is_capital_loss,
    looks_like_capital_loss,
)
from ledger_sync.db.base import Base
from ledger_sync.db.models import (
    DailySummary,
    FYSummary,
    MonthlySummary,
    Transaction,
    TransactionType,
    User,
    UserPreferences,
)

_LOSS_CATEGORY = "Investment Expenses"
_LOSS_SUBCATEGORY = "F&O Loss"
_LOSS_KEY = f"{_LOSS_CATEGORY}::{_LOSS_SUBCATEGORY}"


# --- key parsing -------------------------------------------------------------


def test_empty_preference_classifies_nothing() -> None:
    # The shipped state. Every falsy/degenerate form must yield an empty set,
    # because a non-empty set silently moves a user's historical expense total.
    # "[]" is the specific trap: it is a TRUTHY string, so a plain `if raw:`
    # guard treats "nothing configured" as configured (the same bug that killed
    # the essential-category defaults elsewhere in this codebase).
    for raw in (None, "", "[]", "  ", "not json", '{"a": 1}', "null", '""', "[]  "):
        assert capital_loss_keys(raw) == set(), f"{raw!r} should classify nothing"


def test_keys_are_normalised_case_and_whitespace_insensitively() -> None:
    keys = capital_loss_keys('["  Investment Expenses :: F&O Loss  "]')
    assert keys == {classification_key("investment expenses", "f&o loss")}
    # Same taxonomy in any casing/padding matches the stored key.
    assert is_capital_loss("INVESTMENT EXPENSES", " F&O Loss ", keys)
    assert is_capital_loss("Investment Expenses", "F&O Loss", keys)


def test_a_category_only_key_does_not_match_every_subcategory() -> None:
    # "Investment Expenses" with no separator means subcategory == "", so it must
    # match ONLY rows with an absent subcategory. Matching the whole category
    # would sweep brokerage fees into losses.
    keys = capital_loss_keys(f'["{_LOSS_CATEGORY}"]')
    assert is_capital_loss(_LOSS_CATEGORY, None, keys)
    assert is_capital_loss(_LOSS_CATEGORY, "", keys)
    assert not is_capital_loss(_LOSS_CATEGORY, "Brokerage Charges", keys)
    assert not is_capital_loss(_LOSS_CATEGORY, _LOSS_SUBCATEGORY, keys)


def test_malformed_list_items_are_skipped_not_fatal() -> None:
    # One good key alongside every wrong JSON shape a hand-edited or
    # partially-migrated preference row could carry. The good key survives and
    # nothing raises: a malformed entry must not take down every analytics
    # refresh for that user.
    keys = capital_loss_keys(f'["{_LOSS_KEY}", null, 42, "", "   ", {{}}, [], true]')
    assert keys == {classification_key(_LOSS_CATEGORY, _LOSS_SUBCATEGORY)}


def test_sql_filter_is_none_when_unconfigured() -> None:
    # None is the contract that lets every caller leave its query untouched in
    # the default case, rather than appending a no-op clause.
    assert capital_loss_sql_filter(set()) is None
    assert capital_loss_sql_filter(capital_loss_keys(f'["{_LOSS_KEY}"]')) is not None


# --- detection (signal only) -------------------------------------------------


@pytest.mark.parametrize(
    ("category", "subcategory"),
    [
        ("Investment Expenses", "F&O Loss"),
        ("Investment Expenses", "Stocks Market Loss"),
        ("Investments", "Trading Losses"),
        ("Capital Gains", "LTCG Loss"),
        ("Equity", "Realised Loss"),
        ("Mutual Funds", "Loss on Redemption"),
        ("Crypto", "Written Off"),
        ("F & O", "Loss"),
        ("Stock Market", "Negative Returns"),
    ],
)
def test_detector_flags_loss_taxonomies_across_spellings(category: str, subcategory: str) -> None:
    # The preference is exact-match, so the DETECTOR is what has to be
    # spelling-agnostic; a user whose ledger says "Trading Losses" must get the
    # same prompt as one whose ledger says "F&O Loss".
    assert looks_like_capital_loss(category, subcategory)


@pytest.mark.parametrize(
    ("category", "subcategory"),
    [
        # Cost of investing: real cash paid to participate in a market. A fee is
        # consumption, so flagging it would understate real spending -- the
        # dangerous direction.
        ("Investment Expenses", "Brokerage Charges"),
        ("Investment Expenses", "STT"),
        ("Investment Expenses", "Demat AMC Fees"),
        ("Investments", "Advisory Fee"),
        ("Mutual Funds", "Expense Ratio"),
        ("Stocks", "Stamp Duty"),
        # Ordinary consumption that merely contains a loss word.
        ("Insurance", "Card Loss Replacement"),
        ("Healthcare", "Weight Loss Program"),
        ("Household", "Loss of Deposit"),
        # Investment context with no loss signal at all.
        ("Investment Income", "Dividends"),
        ("Investments", "SIP"),
        # A rental agent's brokerage is not a securities signal.
        ("Housing", "Brokerage"),
        # Nothing to read.
        (None, None),
        ("", ""),
    ],
)
def test_detector_does_not_flag_fees_or_ordinary_spending(
    category: str | None, subcategory: str | None
) -> None:
    assert not looks_like_capital_loss(category, subcategory)


def test_detection_never_classifies_on_its_own() -> None:
    # The load-bearing safety property: a row the detector flags is still NOT a
    # loss for aggregation purposes until the user classifies it. If these two
    # ever agree without a preference, the app has silently rewritten history.
    assert looks_like_capital_loss(_LOSS_CATEGORY, _LOSS_SUBCATEGORY)
    assert not is_capital_loss(_LOSS_CATEGORY, _LOSS_SUBCATEGORY, capital_loss_keys(None))


# --- rollup effects ----------------------------------------------------------


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    db = factory()
    yield db
    db.close()


def _seed(db: Session, *, classify: bool) -> int:
    """Seed one user, one month of rows, and return the user id.

    Shape mirrors the real December-2024 month that produced the -180.1% reading:
    salary in, ordinary spending out, and one large realised loss on a broker
    account.
    """
    user = User(email="loss@example.com", is_active=True, is_verified=True, hashed_password="")
    db.add(user)
    db.flush()
    db.add(
        UserPreferences(
            user_id=user.id,
            essential_categories='["Housing"]',
            capital_loss_categories=f'["{_LOSS_KEY}"]' if classify else "[]",
        )
    )

    def txn(
        txn_type: TransactionType,
        amount: str,
        category: str,
        subcategory: str | None,
        account: str,
        day: int,
    ) -> Transaction:
        when = datetime(2024, 12, day, tzinfo=UTC)
        return Transaction(
            transaction_id=f"{category}-{subcategory}-{amount}-{day}",
            user_id=user.id,
            date=when,
            amount=Decimal(amount),
            currency="INR",
            type=txn_type,
            account=account,
            category=category,
            subcategory=subcategory,
            source_file="t.xlsx",
            last_seen_at=when,
            is_deleted=False,
        )

    db.add_all(
        [
            txn(
                TransactionType.INCOME, "170458.40", "Employment Income", "Salary", "Bank: HDFC", 1
            ),
            txn(TransactionType.EXPENSE, "30000", "Housing", "Rent", "Bank: HDFC", 3),
            txn(TransactionType.EXPENSE, "14639.68", "Food & Dining", "Groceries", "Bank: HDFC", 4),
            txn(
                TransactionType.EXPENSE,
                "102789.41",
                _LOSS_CATEGORY,
                _LOSS_SUBCATEGORY,
                "Stocks: Groww",
                31,
            ),
        ]
    )
    db.commit()
    return user.id


def _seed_with_tax_flavoured_loss(db: Session, *, classify: bool) -> int:
    """Same shape as ``_seed`` but the loss row carries a tax-vocabulary note.

    ``fy_summaries`` credits ``tax_paid`` from ``_TAX_NOTE_RE`` on the note, and
    brokers really do write settlement notes like this one. Without the
    capital-loss branch the row falls through to the tax test and books a
    realised LOSS as tax PAID, which the Tax Planning page then shows as a credit
    the user never paid.
    """
    user = User(email="fyloss@example.com", is_active=True, is_verified=True, hashed_password="")
    db.add(user)
    db.flush()
    db.add(
        UserPreferences(
            user_id=user.id,
            essential_categories='["Housing"]',
            capital_loss_categories=f'["{_LOSS_KEY}"]' if classify else "[]",
        )
    )

    def txn(
        txn_type: TransactionType,
        amount: str,
        category: str,
        subcategory: str | None,
        day: int,
        note: str | None = None,
    ) -> Transaction:
        when = datetime(2024, 12, day, tzinfo=UTC)
        return Transaction(
            transaction_id=f"fy-{category}-{subcategory}-{amount}-{day}",
            user_id=user.id,
            date=when,
            amount=Decimal(amount),
            currency="INR",
            type=txn_type,
            account="Bank: HDFC",
            category=category,
            subcategory=subcategory,
            note=note,
            source_file="t.xlsx",
            last_seen_at=when,
            is_deleted=False,
        )

    db.add_all(
        [
            txn(TransactionType.INCOME, "170458.40", "Employment Income", "Salary", 1),
            txn(TransactionType.EXPENSE, "30000", "Housing", "Rent", 3),
            txn(TransactionType.EXPENSE, "14639.68", "Food & Dining", "Groceries", 4),
            txn(
                TransactionType.EXPENSE,
                "102789.41",
                _LOSS_CATEGORY,
                _LOSS_SUBCATEGORY,
                31,
                note="STCG advance tax adjustment on F&O settlement",
            ),
        ]
    )
    db.commit()
    return user.id


def _fy_rollup(db: Session, user_id: int) -> FYSummary:
    AnalyticsEngine(db, user_id=user_id)._calculate_fy_summaries()
    db.commit()
    # December 2024 with the default April FY start.
    return (
        db.query(FYSummary)
        .filter(FYSummary.user_id == user_id, FYSummary.fiscal_year == "FY2024-25")
        .one()
    )


def _rollup(db: Session, user_id: int) -> MonthlySummary:
    AnalyticsEngine(db, user_id=user_id)._calculate_monthly_summaries()
    db.commit()
    return (
        db.query(MonthlySummary)
        .filter(MonthlySummary.user_id == user_id, MonthlySummary.period_key == "2024-12")
        .one()
    )


def test_unclassified_loss_leaves_the_rollup_exactly_as_before(session: Session) -> None:
    # Direction 1: the shipped state must not move a single number. 30000 +
    # 14639.68 + 102789.41 = 147429.09 of "expenses", which is the pre-fix
    # behaviour, and the loss must NOT appear in the new column.
    row = _rollup(session, _seed(session, classify=False))

    assert row.total_expenses == Decimal("147429.09")
    assert row.capital_losses == Decimal("0")
    assert row.net_savings == Decimal("23029.31")
    # savings_rate is net_savings / income, always. 23029.31 / 170458.40.
    assert float(row.savings_rate) == pytest.approx(13.51, abs=0.01)
    # expense_ratio is the consumption share, and with nothing classified the
    # loss is still consumption, so it reads high.
    assert float(row.expense_ratio) == pytest.approx(86.49, abs=0.01)


def test_classified_loss_leaves_consumption_but_still_lowers_net_savings(
    session: Session,
) -> None:
    row = _rollup(session, _seed(session, classify=True))

    # Out of expenses and into its own auditable bucket.
    assert row.total_expenses == Decimal("44639.68")
    assert row.capital_losses == Decimal("102789.41")

    # expense_ratio is the number that answers "what share of income did I
    # CONSUME", and it is named for that, so the loss leaves it: 44639.68 /
    # 170458.40. This is the metric that moves when a user classifies.
    assert float(row.expense_ratio) == pytest.approx(26.19, abs=0.01)

    # net_savings still subtracts it: the cash left, so month-end wealth is
    # lower and this figure has to reconcile against account balances. It is
    # unchanged from the unclassified case, which is the point -- the split
    # re-labels the money, it does not make it reappear.
    assert row.net_savings == Decimal("23029.31")

    # savings_rate KEEPS ITS DEFINITION: net_savings / total_income, identical
    # to the unclassified case. A relabelling must not silently move a persisted
    # historical metric. If someone redefines it as (income - expenses) / income
    # -- a consumption rate -- this reads 73.81 instead of 13.51 and the same
    # payload publishes two different "savings" answers.
    assert float(row.savings_rate) == pytest.approx(13.51, abs=0.01)

    # A loss is not negative income either: pushing it into the income side
    # would corrupt the savings-rate denominator instead of the numerator, and
    # would break the salary + investment + other == total invariant the
    # /monthly-summaries response publishes.
    assert row.total_income == Decimal("170458.40")
    assert row.salary_income + row.investment_income + row.other_income == row.total_income


def test_classified_loss_is_not_split_across_essential_and_discretionary(
    session: Session,
) -> None:
    # The essential/discretionary partition is over CONSUMPTION. Before the fix
    # the loss fell into discretionary and made the user look like a spendthrift
    # for a bad trade.
    row = _rollup(session, _seed(session, classify=True))

    assert row.essential_expenses == Decimal("30000")
    assert row.discretionary_expenses == Decimal("14639.68")
    assert row.essential_expenses + row.discretionary_expenses == row.total_expenses
    # And it is not counted as a thing the user spent ON.
    assert row.expense_count == 2


def test_daily_summary_net_reconciles_with_the_monthly_rollup(session: Session) -> None:
    # The YearInReview heatmap and top_category read DailySummary. Left in, the
    # loss paints 31 December as the heaviest SPENDING day of the year and names
    # the loss taxonomy as what the user spent most on.
    user_id = _seed(session, classify=True)
    engine = AnalyticsEngine(session, user_id=user_id)
    engine._calculate_monthly_summaries()
    engine._calculate_daily_summaries()
    session.commit()

    loss_day = (
        session.query(DailySummary)
        .filter(DailySummary.user_id == user_id, DailySummary.date == "2024-12-31")
        .one()
    )
    assert loss_day.total_expenses == Decimal("0")
    assert loss_day.top_category is None
    # net still reflects the cash leaving, so the daily series reconciles
    # against the monthly net_savings.
    assert loss_day.net == Decimal("-102789.41")

    monthly = (
        session.query(MonthlySummary)
        .filter(MonthlySummary.user_id == user_id, MonthlySummary.period_key == "2024-12")
        .one()
    )
    daily_net = sum(
        (d.net for d in session.query(DailySummary).filter(DailySummary.user_id == user_id)),
        start=Decimal(0),
    )
    assert daily_net == monthly.net_savings


# --- FY rollup ---------------------------------------------------------------
#
# The FY rollup is a SEPARATE accumulator from the monthly one, with its own copy
# of the type dispatch, and it feeds the Tax Planning and year-over-year pages.
# Nothing asserted on FYSummary.capital_losses, so the whole branch in
# ``fy_summaries._categorize_transaction_for_fy`` could be deleted with a green
# suite. These tests are the ones that fail when it is.


def test_unclassified_loss_leaves_the_fy_rollup_exactly_as_before(session: Session) -> None:
    # Direction 1 for the FY accumulator: shipped state moves nothing.
    row = _fy_rollup(session, _seed(session, classify=False))

    assert row.total_expenses == Decimal("147429.09")
    assert row.capital_losses == Decimal("0")
    assert row.net_savings == Decimal("23029.31")
    assert float(row.savings_rate) == pytest.approx(13.51, abs=0.01)


def test_classified_loss_leaves_fy_expenses_but_still_lowers_fy_net_savings(
    session: Session,
) -> None:
    row = _fy_rollup(session, _seed(session, classify=True))

    # Out of FY consumption, into its own auditable FY bucket.
    assert row.total_expenses == Decimal("44639.68")
    assert row.capital_losses == Decimal("102789.41")

    # The cash left, so FY-end wealth is lower: net_savings is unchanged from
    # the unclassified case and savings_rate keeps its net/income definition, so
    # the FY rate on this row still equals net_savings / total_income.
    assert row.net_savings == Decimal("23029.31")
    assert float(row.savings_rate) == pytest.approx(13.51, abs=0.01)
    assert float(row.savings_rate) == pytest.approx(
        float(row.net_savings / row.total_income * 100), abs=0.01
    )

    # A loss is not negative income, and the income components still sum.
    assert row.total_income == Decimal("170458.40")
    assert (
        row.salary_income + row.bonus_income + row.investment_income + row.other_income
        == row.total_income
    )


def test_classified_loss_is_never_credited_as_fy_tax_paid(session: Session) -> None:
    # The dangerous interaction: the FY expense branch credits ``tax_paid`` from
    # tax vocabulary in the note, and broker settlement notes carry exactly that
    # vocabulary. The capital-loss branch must return BEFORE the tax test, or a
    # 102,789.41 loss shows up on the Tax Planning page as tax the user paid.
    classified = _fy_rollup(session, _seed_with_tax_flavoured_loss(session, classify=True))

    assert classified.capital_losses == Decimal("102789.41")
    assert classified.tax_paid == Decimal("0")
    assert classified.total_expenses == Decimal("44639.68")


def test_unclassified_tax_flavoured_loss_still_books_tax_paid(session: Session) -> None:
    # The mirror of the test above, which keeps it from being satisfied by
    # breaking the tax detection outright: with nothing classified the same row
    # is ordinary spending and the note still credits tax_paid, exactly as
    # before the preference existed.
    row = _fy_rollup(session, _seed_with_tax_flavoured_loss(session, classify=False))

    assert row.capital_losses == Decimal("0")
    assert row.tax_paid == Decimal("102789.41")
    assert row.total_expenses == Decimal("147429.09")
