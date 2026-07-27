"""The rollup backfill migration repairs splits written under the truthiness bug.

``monthly_summaries`` and ``fy_summaries`` PERSIST the preference-derived splits,
and ``/api/analytics/v2/*`` serves the stored columns verbatim, so fixing the
accessors in ``core/analytics/base.py`` only corrects rollups built AFTERWARDS.
These tests pin the data migration that repairs the rows already on disk.

The migration is loaded by path (revision files are not importable modules) and
its ``upgrade()`` is driven against a real in-memory SQLite database through
Alembic's own ``MigrationContext``, so the SQL under test is the SQL that will
run on Neon.

Two properties matter and are tested separately:

1. It REPAIRS rows whose splits were built from unusable preference lists.
2. It does NOT touch rows it cannot prove are repairable -- a user with real
   preferences, or a row whose totals have since gone stale.
"""

from __future__ import annotations

import importlib.util
import json
from datetime import UTC, datetime
from decimal import Decimal
from itertools import count
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from ledger_sync.core._analytics_helpers import DEFAULT_ESSENTIAL_CATEGORIES
from ledger_sync.core.analytics.base import _INCOME_LIST_DEFAULTS
from ledger_sync.core.analytics.classification import ClassificationMixin
from ledger_sync.db.base import Base
from ledger_sync.db.models import (
    FYSummary,
    MonthlySummary,
    Transaction,
    TransactionType,
    User,
    UserPreferences,
)

_MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "src"
    / "ledger_sync"
    / "db"
    / "migrations"
    / "versions"
    / "20260727_1100_backfill_rollup_preference_splits.py"
)

# Amounts are chosen so every bucket is distinguishable from every other and
# from any sum of the others -- if the migration mis-files one row, no assertion
# can pass by coincidence.
SALARY = Decimal("500000.00")
BONUS = Decimal("120000.00")
DIVIDEND = Decimal("7000.00")
GIFT = Decimal("3000.00")
HOUSING = Decimal("40000.00")
SHOPPING = Decimal("9000.00")

TOTAL_INCOME = SALARY + BONUS + DIVIDEND + GIFT
TOTAL_EXPENSES = HOUSING + SHOPPING

PERIOD = "2025-06"
FY_LABEL = "FY2025-26"


def _load_migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("rollup_split_backfill", _MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


migration = _load_migration()


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


_txn_counter = count()


def _txn(session: Session, user_id: int, **kwargs: Any) -> None:
    defaults: dict[str, Any] = {
        # `transaction_id` is the real primary key (a content hash in production)
        # and has no default generator, so every seeded row needs its own.
        "transaction_id": f"txn-{next(_txn_counter)}",
        "user_id": user_id,
        "date": datetime(2025, 6, 15, tzinfo=UTC),
        "account": "Bank: SBI",
        "source_file": "seed.xlsx",
        "is_deleted": False,
        "note": "",
    }
    session.add(Transaction(**{**defaults, **kwargs}))


def _seed_ledger(session: Session, user_id: int) -> None:
    """One month holding every income bucket and both expense buckets."""
    _txn(
        session,
        user_id,
        amount=SALARY,
        type=TransactionType.INCOME,
        category="Employment Income",
        subcategory="Salary",
    )
    _txn(
        session,
        user_id,
        amount=BONUS,
        type=TransactionType.INCOME,
        category="Employment Income",
        subcategory="Bonuses",
    )
    _txn(
        session,
        user_id,
        amount=DIVIDEND,
        type=TransactionType.INCOME,
        category="Investment Income",
        subcategory="Dividends",
    )
    _txn(
        session,
        user_id,
        amount=GIFT,
        type=TransactionType.INCOME,
        category="Other Income",
        subcategory="Gifts",
    )
    _txn(
        session,
        user_id,
        amount=HOUSING,
        type=TransactionType.EXPENSE,
        category="Housing",
        subcategory="Rent",
    )
    _txn(
        session,
        user_id,
        amount=SHOPPING,
        type=TransactionType.EXPENSE,
        category="Shopping",
        subcategory="Clothes",
    )


def _seed_corrupted_rollups(session: Session, user_id: int) -> None:
    """Rollups exactly as the buggy engine wrote them: totals right, splits wrong.

    With all four income lists resolving empty, every predicate returned False so
    every credit fell through to ``other_income``; with ``essential_categories``
    empty, every debit fell through to ``discretionary_expenses``.
    """
    session.add(
        MonthlySummary(
            user_id=user_id,
            year=2025,
            month=6,
            period_key=PERIOD,
            total_income=TOTAL_INCOME,
            salary_income=Decimal(0),
            investment_income=Decimal(0),
            other_income=TOTAL_INCOME,
            total_expenses=TOTAL_EXPENSES,
            essential_expenses=Decimal(0),
            discretionary_expenses=TOTAL_EXPENSES,
        ),
    )
    session.add(
        FYSummary(
            user_id=user_id,
            fiscal_year=FY_LABEL,
            start_date=datetime(2025, 4, 1, tzinfo=UTC),
            end_date=datetime(2026, 3, 31, tzinfo=UTC),
            total_income=TOTAL_INCOME,
            salary_income=Decimal(0),
            bonus_income=Decimal(0),
            investment_income=Decimal(0),
            other_income=TOTAL_INCOME,
            total_expenses=TOTAL_EXPENSES,
        ),
    )


def _make_user(session: Session, prefs: dict[str, Any] | None) -> int:
    user = User(email="owner@example.com", is_active=True, is_verified=True, hashed_password="")
    session.add(user)
    session.flush()
    if prefs is not None:
        session.add(UserPreferences(user_id=user.id, **prefs))
    session.commit()
    return user.id


def _run_upgrade(session: Session) -> None:
    """Execute the migration's ``upgrade()`` against this session's connection."""
    connection = session.connection()
    context = MigrationContext.configure(connection)
    with Operations.context(context):
        migration.upgrade()
    session.commit()
    session.expire_all()


def _monthly(session: Session, user_id: int) -> MonthlySummary:
    return session.execute(
        select(MonthlySummary).where(MonthlySummary.user_id == user_id),
    ).scalar_one()


def _fy(session: Session, user_id: int) -> FYSummary:
    return session.execute(
        select(FYSummary).where(FYSummary.user_id == user_id),
    ).scalar_one()


class TestFrozenDefaultsMatchTheApplication:
    """The migration freezes copies of the shipped defaults; they must be right.

    Migrations cannot import application code (a later schema change would break
    a from-scratch replay), so the constants are duplicated by necessity. These
    tests are the seam that catches the duplication drifting -- without them the
    migration silently rewrites money using stale category names.
    """

    def test_essential_categories_match(self) -> None:
        assert migration._DEFAULT_ESSENTIAL_CATEGORIES == frozenset(
            DEFAULT_ESSENTIAL_CATEGORIES,
        )

    def test_income_lists_match(self) -> None:
        assert migration._DEFAULT_INCOME_LISTS == {
            field: frozenset(values) for field, values in _INCOME_LIST_DEFAULTS.items()
        }

    def test_salary_and_bonus_keywords_match(self) -> None:
        assert migration._SALARY_KEYWORDS == ClassificationMixin._SALARY_KEYWORDS
        assert migration._BONUS_KEYWORDS == ClassificationMixin._BONUS_KEYWORDS


class TestRepairsCorruptedRollups:
    """The victim class: unusable preference lists, so the splits were garbage."""

    @pytest.fixture
    def repaired(self, session: Session) -> tuple[Session, int]:
        # `"[]"` is the model default for all five columns -- and it is TRUTHY,
        # which is the whole bug.
        user_id = _make_user(
            session,
            {
                "essential_categories": "[]",
                "taxable_income_categories": "[]",
                "investment_returns_categories": "[]",
                "non_taxable_income_categories": "[]",
                "other_income_categories": "[]",
            },
        )
        _seed_ledger(session, user_id)
        _seed_corrupted_rollups(session, user_id)
        session.commit()
        _run_upgrade(session)
        return session, user_id

    def test_monthly_expense_split_is_restored(
        self,
        repaired: tuple[Session, int],
    ) -> None:
        session, user_id = repaired
        row = _monthly(session, user_id)

        # Was 0 essential / everything discretionary, i.e. 0% needs on every
        # 50/30/20, Lean FIRE and needs-vs-wants surface.
        assert Decimal(row.essential_expenses) == HOUSING
        assert Decimal(row.discretionary_expenses) == SHOPPING

    def test_monthly_income_split_is_restored(
        self,
        repaired: tuple[Session, int],
    ) -> None:
        session, user_id = repaired
        row = _monthly(session, user_id)

        assert Decimal(row.salary_income) == SALARY
        assert Decimal(row.investment_income) == DIVIDEND
        # MonthlySummary has no bonus column and its salary bucket is
        # salary-keywords-only, so the engine leaves bonus in other_income.
        # The migration must reproduce that shape, not invent a cleaner one.
        assert Decimal(row.other_income) == GIFT + BONUS

    def test_monthly_parts_still_sum_to_the_untouched_totals(
        self,
        repaired: tuple[Session, int],
    ) -> None:
        session, user_id = repaired
        row = _monthly(session, user_id)

        assert Decimal(row.total_income) == TOTAL_INCOME
        assert Decimal(row.total_expenses) == TOTAL_EXPENSES
        assert Decimal(row.salary_income) + Decimal(row.investment_income) + Decimal(
            row.other_income
        ) == Decimal(row.total_income)
        assert Decimal(row.essential_expenses) + Decimal(row.discretionary_expenses) == Decimal(
            row.total_expenses
        )

    def test_fy_income_split_is_restored_with_bonus_separated(
        self,
        repaired: tuple[Session, int],
    ) -> None:
        session, user_id = repaired
        row = _fy(session, user_id)

        # FYSummary DOES carry bonus_income, so here the bonus must split out --
        # the opposite shape from the monthly row above.
        assert Decimal(row.salary_income) == SALARY
        assert Decimal(row.bonus_income) == BONUS
        assert Decimal(row.investment_income) == DIVIDEND
        assert Decimal(row.other_income) == GIFT

    def test_running_it_twice_changes_nothing_more(self, repaired: tuple[Session, int]) -> None:
        session, user_id = repaired
        first = _monthly(session, user_id)
        snapshot = (
            Decimal(first.salary_income),
            Decimal(first.investment_income),
            Decimal(first.other_income),
            Decimal(first.essential_expenses),
            Decimal(first.discretionary_expenses),
        )

        _run_upgrade(session)
        again = _monthly(session, user_id)

        assert snapshot == (
            Decimal(again.salary_income),
            Decimal(again.investment_income),
            Decimal(again.other_income),
            Decimal(again.essential_expenses),
            Decimal(again.discretionary_expenses),
        )


class TestMissingPreferencesRow:
    """No preferences row at all falls back exactly like an empty one."""

    def test_rollups_are_repaired(self, session: Session) -> None:
        user_id = _make_user(session, None)
        _seed_ledger(session, user_id)
        _seed_corrupted_rollups(session, user_id)
        session.commit()

        _run_upgrade(session)

        row = _monthly(session, user_id)
        assert Decimal(row.essential_expenses) == HOUSING
        assert Decimal(row.salary_income) == SALARY


class TestLeavesConfiguredUsersAlone:
    """A real user choice is not overwritten by the shipped defaults."""

    def test_configured_lists_are_not_rewritten(self, session: Session) -> None:
        # This user deliberately calls only Shopping essential and files Salary
        # as non-taxable. Their rollups already reflect that and are CORRECT.
        user_id = _make_user(
            session,
            {
                "essential_categories": json.dumps(["Shopping"]),
                "taxable_income_categories": "[]",
                "investment_returns_categories": "[]",
                "non_taxable_income_categories": json.dumps(["Employment Income::Salary"]),
                "other_income_categories": "[]",
            },
        )
        _seed_ledger(session, user_id)
        session.add(
            MonthlySummary(
                user_id=user_id,
                year=2025,
                month=6,
                period_key=PERIOD,
                total_income=TOTAL_INCOME,
                salary_income=Decimal(0),
                investment_income=Decimal(0),
                other_income=TOTAL_INCOME,
                total_expenses=TOTAL_EXPENSES,
                essential_expenses=SHOPPING,
                discretionary_expenses=HOUSING,
            ),
        )
        session.commit()

        _run_upgrade(session)

        row = _monthly(session, user_id)
        # Housing is NOT essential for this user and Salary is NOT taxable.
        # Injecting the defaults would flip both.
        assert Decimal(row.essential_expenses) == SHOPPING
        assert Decimal(row.discretionary_expenses) == HOUSING
        assert Decimal(row.salary_income) == Decimal(0)
        assert Decimal(row.other_income) == TOTAL_INCOME

    def test_a_reset_row_is_still_treated_as_unconfigured(self, session: Session) -> None:
        # POST /api/preferences/reset persists the shipped non-taxable list
        # verbatim while writing "[]" for the other three. Reading that as
        # "configured" would re-open the bug for every user who hits Reset.
        user_id = _make_user(
            session,
            {
                "essential_categories": "[]",
                "taxable_income_categories": "[]",
                "investment_returns_categories": "[]",
                "non_taxable_income_categories": json.dumps(
                    list(_INCOME_LIST_DEFAULTS["non_taxable_income_categories"]),
                ),
                "other_income_categories": "[]",
            },
        )
        _seed_ledger(session, user_id)
        _seed_corrupted_rollups(session, user_id)
        session.commit()

        _run_upgrade(session)

        assert Decimal(_monthly(session, user_id).salary_income) == SALARY


class TestSkipsStaleRows:
    """A row whose totals no longer match the ledger needs a full refresh."""

    def test_split_is_left_alone_when_totals_disagree(self, session: Session) -> None:
        user_id = _make_user(session, {"essential_categories": "[]"})
        _seed_ledger(session, user_id)
        # Stored totals from an older ledger state (rows imported since). A
        # split-only rewrite here would leave the parts contradicting the whole.
        stale_total = TOTAL_EXPENSES + Decimal("100000.00")
        session.add(
            MonthlySummary(
                user_id=user_id,
                year=2025,
                month=6,
                period_key=PERIOD,
                total_income=TOTAL_INCOME,
                total_expenses=stale_total,
                essential_expenses=Decimal(0),
                discretionary_expenses=stale_total,
            ),
        )
        session.commit()

        _run_upgrade(session)

        row = _monthly(session, user_id)
        assert Decimal(row.essential_expenses) == Decimal(0)
        assert Decimal(row.discretionary_expenses) == stale_total


class TestUserScoping:
    """One user's repair must never read or write another user's rows."""

    def test_a_second_users_rollups_are_untouched(self, session: Session) -> None:
        victim = _make_user(session, {"essential_categories": "[]"})
        _seed_ledger(session, victim)
        _seed_corrupted_rollups(session, victim)

        other = User(
            email="other@example.com",
            is_active=True,
            is_verified=True,
            hashed_password="",
        )
        session.add(other)
        session.flush()
        # FULLY configured, so the migration must skip this user entirely: only
        # Shopping is essential to them and they file Salary as non-taxable.
        session.add(
            UserPreferences(
                user_id=other.id,
                essential_categories=json.dumps(["Shopping"]),
                taxable_income_categories="[]",
                investment_returns_categories="[]",
                non_taxable_income_categories=json.dumps(["Employment Income::Salary"]),
                other_income_categories="[]",
            ),
        )
        # Their own copy of the same ledger and period, with splits that are
        # CORRECT for their preferences and therefore DIFFERENT from what the
        # victim's recompute produces. Totals must match their ledger, otherwise
        # the staleness gate would skip these rows and hide an unscoped write
        # instead of exposing it.
        _seed_ledger(session, other.id)
        session.add(
            MonthlySummary(
                user_id=other.id,
                year=2025,
                month=6,
                period_key=PERIOD,
                total_income=TOTAL_INCOME,
                salary_income=Decimal(0),
                investment_income=Decimal(0),
                other_income=TOTAL_INCOME,
                total_expenses=TOTAL_EXPENSES,
                essential_expenses=SHOPPING,
                discretionary_expenses=HOUSING,
            ),
        )
        session.add(
            FYSummary(
                user_id=other.id,
                fiscal_year=FY_LABEL,
                start_date=datetime(2025, 4, 1, tzinfo=UTC),
                end_date=datetime(2026, 3, 31, tzinfo=UTC),
                total_income=TOTAL_INCOME,
                salary_income=Decimal(0),
                bonus_income=Decimal(0),
                investment_income=Decimal(0),
                other_income=TOTAL_INCOME,
                total_expenses=TOTAL_EXPENSES,
            ),
        )
        session.commit()

        _run_upgrade(session)

        assert Decimal(_monthly(session, victim).essential_expenses) == HOUSING
        assert Decimal(_fy(session, victim).salary_income) == SALARY

        # Reading either rollup table without the user_id filter would apply the
        # victim's repair to these rows -- flipping Housing into essential and
        # re-taxing a salary this user deliberately filed as non-taxable.
        untouched = _monthly(session, other.id)
        assert Decimal(untouched.essential_expenses) == SHOPPING
        assert Decimal(untouched.discretionary_expenses) == HOUSING

        untouched_fy = _fy(session, other.id)
        assert Decimal(untouched_fy.salary_income) == Decimal(0)
        assert Decimal(untouched_fy.bonus_income) == Decimal(0)
        assert Decimal(untouched_fy.other_income) == TOTAL_INCOME


class TestExcludedAccountsAndDeletedRows:
    """The recompute must honour the same filters the engine applies."""

    def test_excluded_accounts_and_deleted_rows_are_left_out(self, session: Session) -> None:
        user_id = _make_user(
            session,
            {
                "essential_categories": "[]",
                "excluded_accounts": json.dumps(["Bank: Excluded"]),
            },
        )
        _seed_ledger(session, user_id)
        # Neither of these belongs in a rollup, so including either would break
        # the totals gate and the row would be skipped instead of repaired.
        _txn(
            session,
            user_id,
            amount=Decimal("50000.00"),
            type=TransactionType.EXPENSE,
            category="Housing",
            subcategory="Rent",
            account="Bank: Excluded",
        )
        _txn(
            session,
            user_id,
            amount=Decimal("60000.00"),
            type=TransactionType.EXPENSE,
            category="Housing",
            subcategory="Rent",
            is_deleted=True,
        )
        _seed_corrupted_rollups(session, user_id)
        session.commit()

        _run_upgrade(session)

        row = _monthly(session, user_id)
        assert Decimal(row.essential_expenses) == HOUSING
        assert Decimal(row.discretionary_expenses) == SHOPPING


class TestFiscalYearBoundary:
    """A transaction on the FY's last day must land inside that FY.

    ``fy_summaries.end_date`` is stored at MIDNIGHT of the final day, so an
    instant comparison (``start <= moment <= end``) silently drops anything timed
    later that same day -- the recomputed total then falls short, the totals gate
    closes, and the row is skipped as stale instead of repaired.
    """

    def test_a_late_evening_march_31_row_is_counted(self, session: Session) -> None:
        user_id = _make_user(session, {"taxable_income_categories": "[]"})
        _txn(
            session,
            user_id,
            date=datetime(2026, 3, 31, 23, 59, tzinfo=UTC),
            amount=SALARY,
            type=TransactionType.INCOME,
            category="Employment Income",
            subcategory="Salary",
        )
        session.add(
            FYSummary(
                user_id=user_id,
                fiscal_year=FY_LABEL,
                start_date=datetime(2025, 4, 1, tzinfo=UTC),
                end_date=datetime(2026, 3, 31, tzinfo=UTC),
                total_income=SALARY,
                salary_income=Decimal(0),
                bonus_income=Decimal(0),
                investment_income=Decimal(0),
                other_income=SALARY,
            ),
        )
        session.commit()

        _run_upgrade(session)

        assert Decimal(_fy(session, user_id).salary_income) == SALARY
