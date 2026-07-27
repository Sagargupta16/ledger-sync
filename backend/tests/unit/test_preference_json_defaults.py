"""Regression tests for "empty JSON preference means unconfigured".

Every JSON preference column on ``UserPreferences`` is ``Text`` whose model
default is the STRING ``"[]"`` / ``"{}"``, and a non-empty string is truthy in
Python. The historic guard shape on ``AnalyticsEngineBase``::

    if self._preferences and self._preferences.essential_categories:  # "[]" -> True
        return set(self._parse_json_field(..., list(DEFAULTS)))       # -> set()
    return DEFAULT_ESSENTIAL_CATEGORIES                               # unreachable

passed for every user whose preferences row had never been edited, so the
documented fallback was dead code and the accessor returned an EMPTY set.

Consequence measured on the owner's live ledger: the 7 shipped defaults classify
roughly seven tenths of expense as essential; the empty set classifies 0.00%,
i.e. 100% of spend is booked discretionary and every needs/wants surface reads
0% needs. Absolute figures stay out of tracked source (this repo is public); the
measurements live in the untracked study notes under ``.claude/docs/studies/``.

Three write paths put ``"[]"`` there for users with no opinion -- the model
default, ``_get_or_create_preferences``, and ``POST /api/preferences/reset`` --
so an empty list cannot mean "deliberately empty". These tests pin both
directions: unconfigured falls back, explicitly configured is honoured
verbatim, and the fields where empty IS meaningful stay empty.

The four INCOME lists are a partition, not four independent fields, so they get a
group rule rather than the per-field one -- see the income section below.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from ledger_sync.core._analytics_helpers import DEFAULT_ESSENTIAL_CATEGORIES
from ledger_sync.core.analytics.base import (
    _INCOME_LIST_DEFAULTS,
    AnalyticsEngineBase,
)
from ledger_sync.core.analytics_engine import AnalyticsEngine
from ledger_sync.db.models import (
    MonthlySummary,
    Transaction,
    TransactionType,
    User,
    UserPreferences,
)

# The exact string the model default, _get_or_create_preferences, and
# /api/preferences/reset all write for a user who has configured nothing.
UNCONFIGURED_LIST = "[]"
UNCONFIGURED_MAPPING = "{}"


def _prefs(session: Session, user: User, **overrides: object) -> UserPreferences:
    """Persist a preferences row, mirroring what a real new user gets."""
    prefs = UserPreferences(user_id=user.id, **overrides)
    session.add(prefs)
    session.commit()
    return prefs


def _engine(session: Session, user: User) -> AnalyticsEngineBase:
    return AnalyticsEngineBase(session, user_id=user.id)


# ─── essential_categories: empty means unconfigured ─────────────────────────


def test_untouched_preferences_row_yields_the_shipped_defaults(
    test_db_session: Session,
    test_user: User,
) -> None:
    """A row created with only user_id must not zero out the defaults.

    This is the exact state of every new user: UserPreferences(user_id=...)
    takes the model default "[]" for essential_categories.
    """
    _prefs(test_db_session, test_user)

    assert _engine(test_db_session, test_user).essential_categories == (
        DEFAULT_ESSENTIAL_CATEGORIES
    )


def test_explicit_empty_json_list_yields_the_shipped_defaults(
    test_db_session: Session,
    test_user: User,
) -> None:
    """ "[]" written by /api/preferences/reset means unconfigured, not "no needs"."""
    _prefs(test_db_session, test_user, essential_categories=UNCONFIGURED_LIST)

    assert _engine(test_db_session, test_user).essential_categories == (
        DEFAULT_ESSENTIAL_CATEGORIES
    )


def test_configured_list_is_honoured_verbatim(
    test_db_session: Session,
    test_user: User,
) -> None:
    """A user who picked categories gets exactly those -- no default union."""
    _prefs(
        test_db_session,
        test_user,
        essential_categories=json.dumps(["Rent", "Groceries"]),
    )

    assert _engine(test_db_session, test_user).essential_categories == {
        "Rent",
        "Groceries",
    }


def test_configured_list_can_exclude_a_default_category(
    test_db_session: Session,
    test_user: User,
) -> None:
    """Opting OUT of a shipped default must stick, or configuration is a no-op."""
    assert "Housing" in DEFAULT_ESSENTIAL_CATEGORIES
    _prefs(test_db_session, test_user, essential_categories=json.dumps(["Utilities"]))

    cats = _engine(test_db_session, test_user).essential_categories
    assert cats == {"Utilities"}
    assert "Housing" not in cats


@pytest.mark.parametrize("stored", ["", "   ", "not json", "null", '"a string"', "[]"])
def test_unusable_stored_values_fall_back(
    test_db_session: Session,
    test_user: User,
    stored: str,
) -> None:
    """Blank, malformed, and wrong-typed JSON degrade to defaults, never raise."""
    _prefs(test_db_session, test_user, essential_categories=stored)

    assert _engine(test_db_session, test_user).essential_categories == (
        DEFAULT_ESSENTIAL_CATEGORIES
    )


def test_no_preferences_row_still_falls_back(
    test_db_session: Session,
    test_user: User,
) -> None:
    """The pre-existing "no row at all" path must keep working."""
    engine = _engine(test_db_session, test_user)

    assert engine._preferences is None
    assert engine.essential_categories == DEFAULT_ESSENTIAL_CATEGORIES


# ─── the fields where empty is MEANINGFUL keep meaning it ───────────────────


def test_empty_excluded_accounts_excludes_nothing(
    test_db_session: Session,
    test_user: User,
) -> None:
    """ "exclude nothing" is a real configuration; it must not gain a default."""
    _prefs(test_db_session, test_user, excluded_accounts=UNCONFIGURED_LIST)

    assert _engine(test_db_session, test_user).excluded_accounts == set()


def test_configured_excluded_accounts_are_honoured(
    test_db_session: Session,
    test_user: User,
) -> None:
    _prefs(
        test_db_session,
        test_user,
        excluded_accounts=json.dumps(["Bank: Old SBI"]),
    )

    assert _engine(test_db_session, test_user).excluded_accounts == {"Bank: Old SBI"}


def test_empty_investment_mappings_stay_empty(
    test_db_session: Session,
    test_user: User,
) -> None:
    """The shipped default is {} by design (no maintainer account names)."""
    _prefs(
        test_db_session,
        test_user,
        investment_account_mappings=UNCONFIGURED_MAPPING,
    )

    assert _engine(test_db_session, test_user).investment_account_patterns == {}


def test_configured_investment_mappings_are_honoured(
    test_db_session: Session,
    test_user: User,
) -> None:
    _prefs(
        test_db_session,
        test_user,
        investment_account_mappings=json.dumps({"Zerodha": "stocks"}),
    )

    assert _engine(test_db_session, test_user).investment_account_patterns == {
        "Zerodha": "stocks",
    }


# ─── income classification: a PARTITION, so the rule is group-wide ──────────
#
# The four lists are written by ONE exclusive-assignment UI:
# IncomeClassificationSection.handleClassify drops the item from all four lists
# and appends it to exactly one. So "taxable is empty because I filed every
# income item as non-taxable" is a state the UI produces, and the per-field rule
# used for essential_categories would RE-TAX that income.
#
# Rule under test: defaults apply only when NO list holds a user choice; an
# individual empty list is honoured as deliberate as soon as a sibling holds one.
# A list equal to its own shipped default is NOT a user choice, because
# POST /api/preferences/reset persists the 9 non-taxable defaults verbatim while
# writing "[]" for the other three.

INCOME_LIST_FIELDS = [
    "taxable_income_categories",
    "investment_returns_categories",
    "non_taxable_income_categories",
    "other_income_categories",
]

# One real "Category::Subcategory" key per field, for populating a sibling.
SIBLING_KEY = {
    "taxable_income_categories": "Employment Income::Salary",
    "investment_returns_categories": "Investment Income::Interest",
    "non_taxable_income_categories": "Refunds & Cashbacks::Other Cashbacks",
    "other_income_categories": "Other Income::Gifts",
}


@pytest.mark.parametrize("field", INCOME_LIST_FIELDS)
def test_all_four_income_lists_empty_falls_back_to_defaults(
    test_db_session: Session,
    test_user: User,
    field: str,
) -> None:
    """Nothing configured anywhere -> every list gets its shipped default.

    This is the state that corrupted real money: with all four empty,
    _is_taxable_income / _is_salary_income / _is_bonus_income /
    _is_investment_income all return False and every credit lands in
    other_income.
    """
    _prefs(
        test_db_session,
        test_user,
        **dict.fromkeys(INCOME_LIST_FIELDS, UNCONFIGURED_LIST),
    )

    assert getattr(_engine(test_db_session, test_user), field)


@pytest.mark.parametrize("field", INCOME_LIST_FIELDS)
def test_empty_income_list_is_honoured_when_a_sibling_is_configured(
    test_db_session: Session,
    test_user: User,
    field: str,
) -> None:
    """A deliberate empty list must NOT gain the defaults back.

    The old per-field rule injected the defaults into every empty list, so a
    user who moved all their income into one bucket got the other buckets'
    defaults re-applied -- re-taxing income they had explicitly marked
    non-taxable. This is the case a per-field parametrized test cannot see,
    because setting one field at a time leaves the siblings empty too.
    """
    sibling = next(f for f in INCOME_LIST_FIELDS if f != field)
    stored = dict.fromkeys(INCOME_LIST_FIELDS, UNCONFIGURED_LIST)
    stored[sibling] = json.dumps(["User::Choice"])
    _prefs(test_db_session, test_user, **stored)

    engine = _engine(test_db_session, test_user)
    assert getattr(engine, field) == []
    assert getattr(engine, sibling) == ["User::Choice"]


@pytest.mark.parametrize("field", INCOME_LIST_FIELDS)
def test_configured_income_list_is_honoured_verbatim(
    test_db_session: Session,
    test_user: User,
    field: str,
) -> None:
    _prefs(test_db_session, test_user, **{field: json.dumps(["A::B"])})

    assert getattr(_engine(test_db_session, test_user), field) == ["A::B"]


def test_reset_row_still_gets_defaults_for_the_three_emptied_lists(
    test_db_session: Session,
    test_user: User,
) -> None:
    """POST /api/preferences/reset must not look like a user choice.

    Reset persists _DEFAULT_NON_TAXABLE_INCOME_CATEGORIES verbatim while writing
    "[]" for the other three fields. Under a naive "any sibling populated" group
    rule the populated non-taxable list would mark the group configured and the
    other three would stay empty -- re-opening this exact bug for every user who
    ever hits Reset.
    """
    _prefs(
        test_db_session,
        test_user,
        taxable_income_categories=UNCONFIGURED_LIST,
        investment_returns_categories=UNCONFIGURED_LIST,
        non_taxable_income_categories=json.dumps(
            list(_INCOME_LIST_DEFAULTS["non_taxable_income_categories"]),
        ),
        other_income_categories=UNCONFIGURED_LIST,
    )

    engine = _engine(test_db_session, test_user)
    assert "Employment Income::Salary" in engine.taxable_income_categories
    assert "Investment Income::Interest" in engine.investment_returns_categories
    assert "Other Income::Gifts" in engine.other_income_categories


@pytest.mark.parametrize("field", INCOME_LIST_FIELDS)
def test_a_real_user_choice_beats_the_shipped_default_test_of_configuredness(
    test_db_session: Session,
    test_user: User,
    field: str,
) -> None:
    """Shipped-default-plus-one-key still counts as configured.

    Guards the reset carve-out from swallowing genuine configuration: the
    comparison is set equality against the field's OWN default, so any deviation
    (an extra key here) is a user choice and the empty siblings stay empty.
    """
    stored = dict.fromkeys(INCOME_LIST_FIELDS, UNCONFIGURED_LIST)
    stored[field] = json.dumps([*_INCOME_LIST_DEFAULTS[field], "Extra::Key"])
    _prefs(test_db_session, test_user, **stored)

    engine = _engine(test_db_session, test_user)
    for other in INCOME_LIST_FIELDS:
        if other != field:
            assert getattr(engine, other) == []


@pytest.mark.parametrize("field", INCOME_LIST_FIELDS)
def test_populated_sibling_does_not_disturb_a_populated_list(
    test_db_session: Session,
    test_user: User,
    field: str,
) -> None:
    """Two populated lists coexist -- no union, no cross-contamination."""
    sibling = next(f for f in INCOME_LIST_FIELDS if f != field)
    stored = dict.fromkeys(INCOME_LIST_FIELDS, UNCONFIGURED_LIST)
    stored[field] = json.dumps([SIBLING_KEY[field]])
    stored[sibling] = json.dumps([SIBLING_KEY[sibling]])
    _prefs(test_db_session, test_user, **stored)

    engine = _engine(test_db_session, test_user)
    assert getattr(engine, field) == [SIBLING_KEY[field]]
    assert getattr(engine, sibling) == [SIBLING_KEY[sibling]]


def _income(user_id: int, txn_id: str, category: str, subcategory: str) -> Transaction:
    date = datetime(2026, 4, 30, tzinfo=UTC)
    return Transaction(
        user_id=user_id,
        transaction_id=txn_id,
        date=date,
        amount=Decimal("100000"),
        currency="INR",
        type=TransactionType.INCOME,
        account="Bank: SBI",
        category=category,
        subcategory=subcategory,
        source_file="t.xlsx",
        last_seen_at=date,
        is_deleted=False,
    )


def test_untouched_row_still_classifies_salary_as_taxable(
    test_db_session: Session,
    test_user: User,
) -> None:
    """End-to-end: the classification a new user's income split depends on."""
    _prefs(test_db_session, test_user)
    engine = AnalyticsEngine(test_db_session, user_id=test_user.id)
    salary = _income(test_user.id, "salary-1", "Employment Income", "Salary")

    assert engine._is_taxable_income(salary) is True
    assert engine._is_salary_income(salary) is True


def test_income_filed_as_non_taxable_is_not_re_taxed(
    test_db_session: Session,
    test_user: User,
) -> None:
    """The blast radius of the per-field rule, end to end.

    A user who filed Salary under non-taxable and left taxable empty had the
    taxable defaults -- which include "Employment Income::Salary" -- injected
    back into the empty list, so the row read taxable AND non-taxable, and the
    tax surfaces re-taxed money the user had explicitly exempted.
    """
    _prefs(
        test_db_session,
        test_user,
        taxable_income_categories=UNCONFIGURED_LIST,
        investment_returns_categories=UNCONFIGURED_LIST,
        non_taxable_income_categories=json.dumps(["Employment Income::Salary"]),
        other_income_categories=UNCONFIGURED_LIST,
    )
    engine = AnalyticsEngine(test_db_session, user_id=test_user.id)
    salary = _income(test_user.id, "salary-2", "Employment Income", "Salary")

    assert "Employment Income::Salary" in engine.non_taxable_income_categories
    assert engine._is_taxable_income(salary) is False
    assert engine._is_salary_income(salary) is False


def test_income_filed_as_other_is_not_counted_as_investment_return(
    test_db_session: Session,
    test_user: User,
) -> None:
    """Same failure on the investment side: Interest filed as "other"."""
    _prefs(
        test_db_session,
        test_user,
        taxable_income_categories=UNCONFIGURED_LIST,
        investment_returns_categories=UNCONFIGURED_LIST,
        non_taxable_income_categories=UNCONFIGURED_LIST,
        other_income_categories=json.dumps(["Investment Income::Interest"]),
    )
    engine = AnalyticsEngine(test_db_session, user_id=test_user.id)
    interest = _income(test_user.id, "interest-1", "Investment Income", "Interest")

    assert engine.investment_returns_categories == []
    assert engine._is_investment_income(interest) is False


# ─── same bug class on a scalar: falsy-but-valid ────────────────────────────


def test_zero_min_confidence_is_honoured_not_replaced_by_the_default(
    test_db_session: Session,
    test_user: User,
) -> None:
    """0 is a legal setting (``RecurringSettingsConfig`` allows ``ge=0``).

    A truthiness guard silently rewrote "show every detected pattern" to 50,
    hiding every pattern below 50% confidence from a user who asked for all.
    """
    _prefs(test_db_session, test_user, recurring_min_confidence=0.0)

    assert _engine(test_db_session, test_user).recurring_min_confidence == 0.0


def test_configured_min_confidence_is_honoured(
    test_db_session: Session,
    test_user: User,
) -> None:
    _prefs(test_db_session, test_user, recurring_min_confidence=30.0)

    assert _engine(test_db_session, test_user).recurring_min_confidence == 30.0


def test_missing_preferences_row_uses_the_min_confidence_default(
    test_db_session: Session,
    test_user: User,
) -> None:
    assert _engine(test_db_session, test_user).recurring_min_confidence == 50.0


# ─── the consumer that actually corrupted the rollup ────────────────────────


def _expense(user_id: int, txn_id: str, category: str, amount: str) -> Transaction:
    date = datetime(2026, 4, 10, tzinfo=UTC)
    return Transaction(
        user_id=user_id,
        transaction_id=txn_id,
        date=date,
        amount=Decimal(amount),
        currency="INR",
        type=TransactionType.EXPENSE,
        account="Bank: SBI",
        category=category,
        subcategory=None,
        source_file="t.xlsx",
        last_seen_at=date,
        is_deleted=False,
    )


def test_monthly_summary_splits_needs_from_wants_for_a_new_user(
    test_db_session: Session,
    test_user: User,
) -> None:
    """The blast radius, reproduced small.

    Before the fix this booked all 3,000 as discretionary (0% essential),
    matching the 0.00% measured against the owner's real ledger.

    Also pins the ROLLUP, not just the accessor: ``monthly_summaries`` persists
    the essential/discretionary split at build time, so a corrupted read wrote
    corrupted rows that every ``/api/analytics/v2/*`` consumer then served back
    verbatim.
    """
    _prefs(test_db_session, test_user)
    test_db_session.add_all(
        [
            _expense(test_user.id, "rent", "Housing", "2000"),
            _expense(test_user.id, "shopping", "Shopping", "1000"),
        ],
    )
    test_db_session.commit()

    engine = AnalyticsEngine(test_db_session, user_id=test_user.id)
    assert engine._calculate_monthly_summaries() == 1
    test_db_session.commit()

    row = (
        test_db_session.query(MonthlySummary)
        .filter(
            MonthlySummary.user_id == test_user.id,
            MonthlySummary.period_key == "2026-04",
        )
        .one()
    )
    assert float(row.total_expenses) == pytest.approx(3000.0)
    assert float(row.essential_expenses) == pytest.approx(2000.0)
    assert float(row.discretionary_expenses) == pytest.approx(1000.0)
