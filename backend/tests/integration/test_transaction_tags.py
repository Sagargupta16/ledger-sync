"""Integration tests for transaction tags.

Covers PUT /api/transactions/{id}/tags (replace-all semantics,
normalization, validation, 404 cases), the ``tag`` filter on
GET /api/transactions/search, tags on list/search responses, and the
tag facets on GET /api/transactions/facets.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from ledger_sync.api.deps import get_current_user
from ledger_sync.api.main import app
from ledger_sync.db.base import Base
from ledger_sync.db.models import Transaction, TransactionType, User, UserPreferences
from ledger_sync.db.session import get_session

FACET_KEYS = {
    "categories",
    "accounts",
    "tags",
    "income_count",
    "expense_count",
    "transfer_count",
    "total_count",
}


@pytest.fixture
def tags_client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine)  # noqa: N806
    session = TestSession()

    user_a = User(email="a@example.com", is_active=True, is_verified=True, hashed_password="")
    user_b = User(email="b@example.com", is_active=True, is_verified=True, hashed_password="")
    session.add_all([user_a, user_b])
    session.flush()
    session.add(UserPreferences(user_id=user_a.id, essential_categories="[]"))
    session.commit()

    current = {"user": user_a}

    def override_get_session():
        yield session

    def override_get_current_user():
        return current["user"]

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_current_user] = override_get_current_user

    client = TestClient(app)
    yield client, session, user_a, user_b, current

    app.dependency_overrides.clear()
    session.close()


def _seed_txn(
    session: Session,
    user_id: int,
    tx_id: str,
    *,
    category: str = "Food",
    account: str = "Cash",
    is_deleted: bool = False,
    tx_type: TransactionType = TransactionType.EXPENSE,
) -> str:
    transaction_id = tx_id.ljust(64, "0")[:64]
    session.add(
        Transaction(
            transaction_id=transaction_id,
            user_id=user_id,
            date=datetime(2026, 6, 1, tzinfo=UTC),
            amount=Decimal("100.00"),
            currency="INR",
            type=tx_type,
            account=account,
            category=category,
            source_file="test.xlsx",
            is_deleted=is_deleted,
        )
    )
    session.commit()
    return transaction_id


def _put_tags(client: TestClient, txn_id: str, tags: list[str]):
    return client.put(f"/api/transactions/{txn_id}/tags", json={"tags": tags})


# --- PUT /api/transactions/{id}/tags ---


def test_put_tags_replaces_full_set(tags_client) -> None:
    client, session, user_a, _, _ = tags_client
    txn_id = _seed_txn(session, user_a.id, "t1")

    first = _put_tags(client, txn_id, ["a", "b"])
    assert first.status_code == 200, first.json()
    assert first.json() == {"transaction_id": txn_id, "tags": ["a", "b"]}

    # Full replacement: only 'c' survives.
    second = _put_tags(client, txn_id, ["c"])
    assert second.json()["tags"] == ["c"]

    # Empty list clears everything.
    cleared = _put_tags(client, txn_id, [])
    assert cleared.status_code == 200
    assert cleared.json()["tags"] == []
    listed = client.get("/api/transactions").json()
    assert listed["data"][0]["tags"] == []


def test_put_tags_normalizes(tags_client) -> None:
    client, session, user_a, _, _ = tags_client
    txn_id = _seed_txn(session, user_a.id, "t1")

    r = _put_tags(client, txn_id, [" work ", "", "   ", "work", "travel"])

    assert r.status_code == 200
    # Trimmed, empties dropped, exact duplicates deduped, order preserved.
    assert r.json()["tags"] == ["work", "travel"]


def test_put_tags_validation(tags_client) -> None:
    client, session, user_a, _, _ = tags_client
    txn_id = _seed_txn(session, user_a.id, "t1")

    eleven = [f"tag{i}" for i in range(11)]
    assert _put_tags(client, txn_id, eleven).status_code == 422

    assert _put_tags(client, txn_id, ["x" * 51]).status_code == 422


def test_put_tags_unknown_or_foreign_transaction_404(tags_client) -> None:
    client, session, user_a, user_b, _ = tags_client
    foreign_id = _seed_txn(session, user_b.id, "foreign")
    deleted_id = _seed_txn(session, user_a.id, "gone", is_deleted=True)

    missing = _put_tags(client, "0" * 64, ["work"])
    foreign = _put_tags(client, foreign_id, ["work"])
    soft_deleted = _put_tags(client, deleted_id, ["work"])

    for response in (missing, foreign, soft_deleted):
        assert response.status_code == 404
        assert response.json() == {"detail": "Transaction not found"}


# --- Search tag filter ---


def test_search_tag_filter_exact_match(tags_client) -> None:
    client, session, user_a, _, _ = tags_client
    tagged = _seed_txn(session, user_a.id, "tagged", category="Food")
    _seed_txn(session, user_a.id, "untagged", category="Food")
    other_cat = _seed_txn(session, user_a.id, "rent", category="Rent")
    _put_tags(client, tagged, ["work"])
    _put_tags(client, other_cat, ["work"])

    only_work = client.get("/api/transactions/search", params={"tag": "work"})
    assert only_work.status_code == 200
    assert {t["id"] for t in only_work.json()["data"]} == {tagged, other_cat}

    # Composes (AND) with the category filter.
    composed = client.get("/api/transactions/search", params={"tag": "work", "category": "Food"})
    assert [t["id"] for t in composed.json()["data"]] == [tagged]

    # Tags are case-sensitive: 'Work' matches nothing.
    case_variant = client.get("/api/transactions/search", params={"tag": "Work"})
    assert case_variant.json()["data"] == []


def test_list_and_search_responses_include_sorted_tags(tags_client) -> None:
    client, session, user_a, _, _ = tags_client
    tagged = _seed_txn(session, user_a.id, "tagged")
    untagged = _seed_txn(session, user_a.id, "plain")
    _put_tags(client, tagged, ["zebra", "apple"])

    listed = client.get("/api/transactions").json()["data"]
    searched = client.get("/api/transactions/search").json()["data"]

    for rows in (listed, searched):
        by_id = {row["id"]: row for row in rows}
        assert by_id[tagged]["tags"] == ["apple", "zebra"]  # alphabetical
        assert by_id[untagged]["tags"] == []


# --- Facets ---


def test_facets_include_tag_counts(tags_client) -> None:
    client, session, user_a, _, _ = tags_client
    session.query(UserPreferences).filter_by(user_id=user_a.id).update(
        {"excluded_accounts": json.dumps(["Excluded Wallet"])}
    )
    session.commit()
    live_1 = _seed_txn(session, user_a.id, "live1")
    live_2 = _seed_txn(session, user_a.id, "live2")
    excluded = _seed_txn(session, user_a.id, "excl", account="Excluded Wallet")
    # Tag everything BEFORE soft-deleting so the PUT 404 guard doesn't trip.
    _put_tags(client, live_1, ["work", "travel"])
    _put_tags(client, live_2, ["work"])
    _put_tags(client, excluded, ["work"])
    dead = _seed_txn(session, user_a.id, "dead")
    _put_tags(client, dead, ["work"])
    session.query(Transaction).filter(Transaction.transaction_id == dead).update(
        {"is_deleted": True}
    )
    session.commit()

    r = client.get("/api/transactions/facets")

    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) == FACET_KEYS
    # Soft-deleted and excluded-account transactions don't count:
    # work -> live_1 + live_2 only; travel -> live_1. Sorted count desc, name asc.
    assert body["tags"] == [
        {"name": "work", "count": 2},
        {"name": "travel", "count": 1},
    ]
