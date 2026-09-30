"""Calculation response parity without loading the ledger into ORM objects."""

import json
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import event, func, select
from sqlalchemy.dialects import postgresql, sqlite

from ledger_sync.core.query_helpers import fmt_date, fmt_year_month
from ledger_sync.db.models import Transaction, TransactionType

# Expected responses for the rows the aggregate-parity test seeds, derived by
# hand. Counted: user A's live rows in scope (not deleted, not excluded, not
# user B's), amounts taken as absolute values, the empty category labelled
# "Other Income". January 2026 income is
# 12.34 + |-3.21| + 12.34 ("") + 12.34 (REFUND) = 40.23. Both full 3-month
# windows (2020-01..2026-02 and 2026-01..2026-04) hold 40.23 + 12.34 + 12.34.
_THREE_MONTH_AVERAGE = (40.23 + 12.34 + 12.34) / 3
_EXPECTED_INCOME_ANALYSIS = {
    "total_income": 77.25,
    "category_breakdown": {"Income": 52.57, "Other Income": 12.34, "REFUND": 12.34},
    "monthly_data": [
        {"month": "2020-01", "income": 12.34, "income_avg_3m": None},
        {"month": "2026-01", "income": 40.23, "income_avg_3m": None},
        {"month": "2026-02", "income": 12.34, "income_avg_3m": _THREE_MONTH_AVERAGE},
        {"month": "2026-04", "income": 12.34, "income_avg_3m": _THREE_MONTH_AVERAGE},
    ],
    # REFUND::CASHBACK is both the only cashback-subcategory row and the whole
    # requested non-taxable list.
    "cashbacks_total": 12.34,
    "non_taxable_total": 12.34,
    "peak_income": 40.23,
    "growth_rate": 0.0,
}
# Food expenses per requested slot; the repeated 2026-01 key fills its last
# slot (12.34 + |-1.23|), February is not requested and 2020 is out of range.
_EXPECTED_CATEGORY_HISTORY = {"Food": [12.34, 0.0, 0.0, 13.57]}
_EMPTY_INCOME_ANALYSIS = {
    "total_income": 0.0,
    "category_breakdown": {},
    "monthly_data": [],
    "cashbacks_total": 0.0,
    "non_taxable_total": 0.0,
    "peak_income": 0.0,
    "growth_rate": 0.0,
}


def _assert_same_response(actual, expected):
    """SQL Decimal sums may remove the old float accumulator's sub-cent noise."""
    if isinstance(expected, dict):
        assert actual.keys() == expected.keys()
        for key in expected:
            _assert_same_response(actual[key], expected[key])
    elif isinstance(expected, list):
        assert len(actual) == len(expected)
        for item, reference in zip(actual, expected, strict=True):
            _assert_same_response(item, reference)
    elif isinstance(expected, float):
        assert actual == pytest.approx(expected, rel=1e-12, abs=1e-10)
    else:
        assert actual == expected


def _seed(session, user_id, *, month=1, year=2026, kind=TransactionType.INCOME, **values):
    sequence = session.query(Transaction).count()
    transaction = Transaction(
        transaction_id=f"synthetic-{user_id}-{sequence}",
        user_id=user_id,
        date=datetime(year, month, 15, tzinfo=UTC),
        amount=Decimal("12.34"),
        currency="INR",
        type=kind,
        account="Synthetic",
        category="Income" if kind == TransactionType.INCOME else "Food",
        subcategory="Other",
        source_file="synthetic.csv",
    )
    for key, value in values.items():
        setattr(transaction, key, value)
    session.add(transaction)
    session.commit()


@pytest.mark.parametrize("endpoint", ["income-analysis", "category-monthly-history"])
def test_aggregates_match_existing_math_without_transaction_hydration(two_user_client, endpoint):
    client, session, user, other, _ = two_user_client
    user.preferences.excluded_accounts = json.dumps(["Excluded"])
    session.commit()
    for month in [1, 2, 4]:
        _seed(session, user.id, month=month)
        _seed(session, user.id, month=month, kind=TransactionType.EXPENSE)
    # Seed pre-constraint correction rows only in this isolated SQLite fixture.
    # Re-enable checks before exercising either HTTP calculation endpoint.
    session.connection().exec_driver_sql("PRAGMA ignore_check_constraints=ON")
    try:
        _seed(session, user.id, amount=Decimal("-3.21"))
        _seed(session, user.id, kind=TransactionType.EXPENSE, amount=Decimal("-1.23"))
    finally:
        session.rollback()
        session.connection().exec_driver_sql("PRAGMA ignore_check_constraints=OFF")
        session.commit()
    _seed(session, user.id, year=2020)
    _seed(session, user.id, year=2020, kind=TransactionType.EXPENSE)
    _seed(session, user.id, category="", subcategory="")
    _seed(session, user.id, category="REFUND", subcategory="CASHBACK")
    _seed(session, user.id, account="Excluded")
    _seed(session, user.id, is_deleted=True)
    _seed(session, other.id)
    _seed(session, user.id, kind=TransactionType.TRANSFER)
    months = ["2026-04", "2026-03", "2026-01", "2026-01"]
    # The request reuses this user object after expunge_all, so load it and the
    # excluded-accounts preference the query reads while it is still attached.
    session.refresh(user)
    assert user.preferences.excluded_accounts == json.dumps(["Excluded"])
    if endpoint == "income-analysis":
        expected = _EXPECTED_INCOME_ANALYSIS
        params = {"cashback_categories": ["refund::cashback"]}
    else:
        expected = _EXPECTED_CATEGORY_HISTORY
        params = {"months": ",".join(months)}
    session.expunge_all()
    loaded = []
    statements = []

    def on_load(transaction, _context):
        loaded.append(transaction.transaction_id)

    def on_statement(_conn, _cursor, statement, _parameters, _context, _many):
        statements.append(statement)

    event.listen(Transaction, "load", on_load)
    event.listen(session.bind, "before_cursor_execute", on_statement)
    try:
        response = client.get(f"/api/calculations/{endpoint}", params=params)
    finally:
        event.remove(Transaction, "load", on_load)
        event.remove(session.bind, "before_cursor_execute", on_statement)
    assert response.status_code == 200
    _assert_same_response(response.json(), expected)
    assert loaded == []
    assert any("GROUP BY" in statement for statement in statements)


@pytest.mark.parametrize("months", ["2026-13", "not-a-month", ",".join(["2026-01"] * 121)])
def test_month_keys_are_validated_and_bounded(two_user_client, months):
    client, *_ = two_user_client
    response = client.get("/api/calculations/category-monthly-history", params={"months": months})
    assert response.status_code == 422


def test_income_analysis_retains_date_and_category_filters(two_user_client):
    client, session, user, _, _ = two_user_client
    _seed(session, user.id, month=1, category="Salary")
    _seed(session, user.id, month=2, category="Salary", amount=Decimal("2.01"))
    _seed(session, user.id, month=2, category="Other")
    _seed(session, user.id, month=3, category="Salary")
    _seed(session, user.id, month=2, category="Salary", kind=TransactionType.EXPENSE)
    response = client.get(
        "/api/calculations/income-analysis",
        params={"start_date": "2026-02-01", "end_date": "2026-02-28", "category": "Salary"},
    )
    assert response.status_code == 200
    assert response.json()["total_income"] == 2.01
    assert response.json()["category_breakdown"] == {"Salary": 2.01}
    assert response.json()["monthly_data"] == [
        {"month": "2026-02", "income": 2.01, "income_avg_3m": None}
    ]


def test_date_helpers_follow_the_executing_dialect():
    """The SQL comes from the engine that runs it, not the URL configured at import.

    A grouped month must also be spelled identically in SELECT and GROUP BY, or
    PostgreSQL rejects the query.
    """
    month = fmt_year_month(Transaction.date)
    statement = select(month, fmt_date(Transaction.date), func.count()).group_by(month)

    on_postgres = str(statement.compile(dialect=postgresql.dialect()))
    on_sqlite = str(statement.compile(dialect=sqlite.dialect()))

    assert on_postgres.count("to_char(transactions.date, 'YYYY-MM')") == 2
    assert "to_char(transactions.date, 'YYYY-MM-DD')" in on_postgres
    assert "strftime" not in on_postgres
    assert on_sqlite.count("strftime('%Y-%m', transactions.date)") == 2
    assert "strftime('%Y-%m-%d', transactions.date)" in on_sqlite
    assert "to_char" not in on_sqlite


def test_empty_calculation_responses(two_user_client):
    client, *_ = two_user_client
    assert (
        client.get("/api/calculations/category-monthly-history", params={"months": ""}).json() == {}
    )
    _assert_same_response(
        client.get("/api/calculations/income-analysis").json(),
        _EMPTY_INCOME_ANALYSIS,
    )
