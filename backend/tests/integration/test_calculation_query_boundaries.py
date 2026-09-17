"""Calculation response parity without loading the ledger into ORM objects."""

import json
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import event

from ledger_sync.api.calculations_helpers import (
    _compute_category_monthly_history,
    _compute_income_analysis,
)
from ledger_sync.core.query_helpers import build_transaction_query
from ledger_sync.db.models import Transaction, TransactionType


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
    transactions = build_transaction_query(session, user).all()
    if endpoint == "income-analysis":
        expected = _compute_income_analysis(transactions, ["refund::cashback"])
        params = {"cashback_categories": ["refund::cashback"]}
    else:
        expected = _compute_category_monthly_history(transactions, TransactionType.EXPENSE, months)
        params = {"months": ",".join(months)}
    del transactions
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


def test_empty_calculation_responses(two_user_client):
    client, *_ = two_user_client
    assert (
        client.get("/api/calculations/category-monthly-history", params={"months": ""}).json() == {}
    )
    _assert_same_response(
        client.get("/api/calculations/income-analysis").json(),
        _compute_income_analysis([], []),
    )
