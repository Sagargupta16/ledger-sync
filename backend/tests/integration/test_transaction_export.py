"""Integration tests for GET /api/transactions/export.

The endpoint declared only ``start_date``/``end_date`` while the table it
exports is driven by ``/api/transactions/search``'s full ``SearchFilters``.
FastAPI accepted every other filter and the handler ignored all of them, so
filtering the Transactions table and clicking Export downloaded the whole
ledger: on the maintainer's data ``type=Income`` exported 6,961 rows against
the 726 the table showed.

It also emitted 13 columns with no ``tags``, so an exported ledger could not be
re-imported or audited with its tags.

These tests pin both: the export result set must equal the search result set
for the same filters, and every row must carry its tags.
"""

from __future__ import annotations

import csv
import io
import json
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from ledger_sync.db.models import Transaction, TransactionType

EXPECTED_HEADER = [
    "id",
    "date",
    "amount",
    "currency",
    "type",
    "category",
    "subcategory",
    "account",
    "from_account",
    "to_account",
    "note",
    "source_file",
    "last_seen_at",
    "tags",
]


@pytest.fixture
def export_client(two_user_client):
    """Alias for the shared two-user HTTP fixture (see tests/conftest.py)."""
    return two_user_client


def _seed_txn(
    session: Session,
    user_id: int,
    tx_id: str,
    *,
    tx_type: TransactionType = TransactionType.EXPENSE,
    category: str = "Food",
    account: str = "Cash",
    amount: str = "100.00",
    date: datetime | None = None,
    note: str = "",
) -> str:
    transaction_id = tx_id.ljust(64, "0")[:64]
    session.add(
        Transaction(
            transaction_id=transaction_id,
            user_id=user_id,
            date=date or datetime(2026, 6, 1, tzinfo=UTC),
            amount=Decimal(amount),
            currency="INR",
            type=tx_type,
            account=account,
            category=category,
            note=note,
            source_file="test.xlsx",
            is_deleted=False,
        )
    )
    session.commit()
    return transaction_id


def _export_rows(client: TestClient, params: dict | None = None) -> list[dict[str, str]]:
    response = client.get("/api/transactions/export", params=params or {})
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/csv")
    return list(csv.DictReader(io.StringIO(response.text)))


def _search_ids(client: TestClient, params: dict | None = None) -> set[str]:
    response = client.get("/api/transactions/search", params={**(params or {}), "limit": 1000})
    assert response.status_code == 200, response.text
    return {row["id"] for row in response.json()["data"]}


# --- Defect 1: filters were accepted and then dropped ---


def test_export_honours_type_filter_and_matches_search(export_client) -> None:
    """``type=Income`` must export income only -- not the whole ledger."""
    client, session, user_a, _user_b, _current = export_client
    income = _seed_txn(session, user_a.id, "inc", tx_type=TransactionType.INCOME)
    expense = _seed_txn(session, user_a.id, "exp", tx_type=TransactionType.EXPENSE)
    transfer = _seed_txn(session, user_a.id, "trf", tx_type=TransactionType.TRANSFER)

    exported = {row["id"] for row in _export_rows(client, {"type": "Income"})}

    assert exported == {income}
    assert expense not in exported
    assert transfer not in exported
    # The file must agree with the table it was exported from.
    assert exported == _search_ids(client, {"type": "Income"})


def test_export_is_user_scoped(export_client) -> None:
    """User A's export never contains user B's rows, filtered or not."""
    client, session, user_a, user_b, _current = export_client
    mine = _seed_txn(session, user_a.id, "mine", tx_type=TransactionType.INCOME)
    theirs = _seed_txn(session, user_b.id, "theirs", tx_type=TransactionType.INCOME)

    unfiltered = {row["id"] for row in _export_rows(client)}
    filtered = {row["id"] for row in _export_rows(client, {"type": "Income"})}

    assert unfiltered == {mine}
    assert filtered == {mine}
    assert theirs not in unfiltered
    assert theirs not in filtered


@pytest.mark.parametrize(
    ("params", "expected_key"),
    [
        ({"category": "Rent"}, "rent"),
        ({"account": "HDFC"}, "hdfc"),
        ({"query": "netflix"}, "note"),
        ({"min_amount": 5000}, "big"),
        ({"max_amount": 50}, "small"),
        ({"subcategory": "Groceries"}, "sub"),
    ],
)
def test_export_applies_every_search_filter(export_client, params, expected_key) -> None:
    """Each non-date filter narrows the export exactly as it narrows search."""
    client, session, user_a, _user_b, _current = export_client
    ids = {
        "rent": _seed_txn(session, user_a.id, "rent", category="Rent"),
        "hdfc": _seed_txn(session, user_a.id, "hdfc", account="HDFC"),
        "note": _seed_txn(session, user_a.id, "note", note="netflix monthly"),
        "big": _seed_txn(session, user_a.id, "big", amount="9000.00"),
        "small": _seed_txn(session, user_a.id, "small", amount="10.00"),
    }
    sub_id = _seed_txn(session, user_a.id, "sub")
    session.query(Transaction).filter(Transaction.transaction_id == sub_id).update(
        {"subcategory": "Groceries"}
    )
    session.commit()
    ids["sub"] = sub_id

    exported = {row["id"] for row in _export_rows(client, params)}

    assert exported == {ids[expected_key]}
    assert exported == _search_ids(client, params)


def test_export_applies_tag_filter(export_client) -> None:
    """The ``tag`` filter reaches the export, via the same EXISTS helper."""
    client, session, user_a, _user_b, _current = export_client
    tagged = _seed_txn(session, user_a.id, "tagged")
    untagged = _seed_txn(session, user_a.id, "plain")
    assert (
        client.put(f"/api/transactions/{tagged}/tags", json={"tags": ["work"]}).status_code == 200
    )

    exported = {row["id"] for row in _export_rows(client, {"tag": "work"})}

    assert exported == {tagged}
    assert untagged not in exported


def test_export_still_honours_date_range(export_client) -> None:
    """start_date/end_date keep working, end date inclusive of the whole day."""
    client, session, user_a, _user_b, _current = export_client
    before = _seed_txn(session, user_a.id, "before", date=datetime(2026, 5, 31, tzinfo=UTC))
    inside = _seed_txn(session, user_a.id, "inside", date=datetime(2026, 6, 15, tzinfo=UTC))
    # Same-day-with-a-time row: _inclusive_end must not drop it.
    edge = _seed_txn(session, user_a.id, "edge", date=datetime(2026, 6, 30, 18, 45, tzinfo=UTC))
    after = _seed_txn(session, user_a.id, "after", date=datetime(2026, 7, 1, tzinfo=UTC))

    exported = {
        row["id"]
        for row in _export_rows(client, {"start_date": "2026-06-01", "end_date": "2026-06-30"})
    }

    assert exported == {inside, edge}
    assert before not in exported
    assert after not in exported


def test_export_combines_filters(export_client) -> None:
    """Filters AND together, as they do in search."""
    client, session, user_a, _user_b, _current = export_client
    match = _seed_txn(
        session,
        user_a.id,
        "match",
        tx_type=TransactionType.INCOME,
        category="Salary",
        date=datetime(2026, 6, 10, tzinfo=UTC),
    )
    wrong_type = _seed_txn(session, user_a.id, "wtype", category="Salary")
    wrong_category = _seed_txn(
        session, user_a.id, "wcat", tx_type=TransactionType.INCOME, category="Interest"
    )
    wrong_date = _seed_txn(
        session,
        user_a.id,
        "wdate",
        tx_type=TransactionType.INCOME,
        category="Salary",
        date=datetime(2026, 1, 5, tzinfo=UTC),
    )
    params = {
        "type": "Income",
        "category": "Salary",
        "start_date": "2026-06-01",
        "end_date": "2026-06-30",
    }

    exported = {row["id"] for row in _export_rows(client, params)}

    assert exported == {match}
    for excluded in (wrong_type, wrong_category, wrong_date):
        assert excluded not in exported
    assert exported == _search_ids(client, params)


def test_export_excludes_soft_deleted_rows(export_client) -> None:
    """Regression guard on the base query the filters are layered onto."""
    client, session, user_a, _user_b, _current = export_client
    live = _seed_txn(session, user_a.id, "live")
    dead = _seed_txn(session, user_a.id, "dead")
    session.query(Transaction).filter(Transaction.transaction_id == dead).update(
        {"is_deleted": True}
    )
    session.commit()

    exported = {row["id"] for row in _export_rows(client)}

    assert exported == {live}


# --- Defect 2: the CSV omitted tags ---


def test_export_header_includes_tags(export_client) -> None:
    client, session, user_a, _user_b, _current = export_client
    _seed_txn(session, user_a.id, "one")

    response = client.get("/api/transactions/export")

    header = next(csv.reader(io.StringIO(response.text)))
    assert header == EXPECTED_HEADER


def test_export_rows_carry_their_tags(export_client) -> None:
    """Tags serialize as the JSON array the API already publishes."""
    client, session, user_a, _user_b, _current = export_client
    tagged = _seed_txn(session, user_a.id, "tagged")
    untagged = _seed_txn(session, user_a.id, "plain")
    client.put(f"/api/transactions/{tagged}/tags", json={"tags": ["zebra", "apple"]})

    by_id = {row["id"]: row for row in _export_rows(client)}

    # Alphabetical, matching _tags_for_transactions / the search response.
    assert json.loads(by_id[tagged]["tags"]) == ["apple", "zebra"]
    # Untagged rows are still parseable, not blank.
    assert json.loads(by_id[untagged]["tags"]) == []


def test_export_tags_are_user_scoped(export_client) -> None:
    """A tag another user put on their own row never leaks into this export."""
    client, session, user_a, user_b, current = export_client
    mine = _seed_txn(session, user_a.id, "mine")
    theirs = _seed_txn(session, user_b.id, "theirs")
    current["user"] = user_b
    client.put(f"/api/transactions/{theirs}/tags", json={"tags": ["secret"]})
    current["user"] = user_a

    rows = _export_rows(client)

    assert [row["id"] for row in rows] == [mine]
    assert json.loads(rows[0]["tags"]) == []
