"""Integration tests for the /api/categorization-rules endpoints.

TestClient with dependency overrides for get_session and get_current_user.
SQLite in-memory with StaticPool + check_same_thread=False so the test
session and the request handler thread share one connection (and therefore
the same in-memory database).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy.orm import Session

from ledger_sync.core import rules as rules_engine
from ledger_sync.core.sync_engine import SyncEngine
from ledger_sync.db.models import (
    Anomaly,
    AnomalyType,
    Transaction,
    TransactionTag,
    TransactionType,
    User,
)
from ledger_sync.ingest.hash_id import TransactionHasher

RULE_KEYS = {
    "id",
    "match_field",
    "pattern",
    "category",
    "subcategory",
    "is_active",
    "sort_order",
    "created_at",
}


@pytest.fixture
def rules_client(two_user_client):
    """Alias for the shared two-user HTTP fixture (see tests/conftest.py)."""
    return two_user_client


def _rule_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "match_field": "note",
        "pattern": "swiggy",
        "category": "Food",
        "subcategory": "Delivery",
        "is_active": True,
        "sort_order": 0,
    }
    payload.update(overrides)
    return payload


def _seed_txn(
    session: Session,
    user_id: int,
    tx_id: str,
    *,
    note: str | None = None,
    category: str = "Misc",
    subcategory: str | None = None,
    account: str = "Cash",
    amount: float = 250.0,
    tx_type: TransactionType = TransactionType.EXPENSE,
    date: datetime | None = None,
) -> Transaction:
    txn = Transaction(
        transaction_id=tx_id.ljust(64, "0")[:64],
        user_id=user_id,
        date=date or datetime(2026, 6, 1, 12, 0, 0),  # noqa: DTZ001 - naive like SQLite storage
        amount=Decimal(str(amount)),
        currency="INR",
        type=tx_type,
        account=account,
        category=category,
        subcategory=subcategory,
        note=note,
        source_file="test.xlsx",
    )
    session.add(txn)
    session.commit()
    return txn


def _recomputed_id(txn: Transaction, user_id: int, occurrence: int = 0) -> str:
    return TransactionHasher().generate_transaction_id(
        date=txn.date,
        amount=txn.amount,
        account=txn.account,
        note=txn.note,
        category=txn.category,
        subcategory=txn.subcategory,
        tx_type=txn.type.value,
        user_id=user_id,
        occurrence=occurrence,
    )


# --- CRUD ---


def test_crud_roundtrip(rules_client) -> None:
    client, _, _, _, _ = rules_client

    # Create (subcategory omitted -> stored NULL -> coalesced to "").
    created = client.post("/api/categorization-rules", json=_rule_payload(subcategory=None))
    assert created.status_code == 201, created.json()
    rule = created.json()
    assert rule["subcategory"] == ""
    rule_id = rule["id"]

    # List contains it.
    listed = client.get("/api/categorization-rules")
    assert listed.status_code == 200
    assert [r["id"] for r in listed.json()] == [rule_id]
    assert listed.json()[0]["pattern"] == "swiggy"

    # Full-replace update.
    updated = client.put(
        f"/api/categorization-rules/{rule_id}",
        json=_rule_payload(pattern="zomato", category="Dining", is_active=False, sort_order=3),
    )
    assert updated.status_code == 200, updated.json()
    body = updated.json()
    assert body["pattern"] == "zomato"
    assert body["category"] == "Dining"
    assert body["subcategory"] == "Delivery"
    assert body["is_active"] is False
    assert body["sort_order"] == 3

    # Delete -> 204 empty body, then list is empty.
    deleted = client.delete(f"/api/categorization-rules/{rule_id}")
    assert deleted.status_code == 204
    assert deleted.content == b""
    assert client.get("/api/categorization-rules").json() == []


def test_put_unknown_rule_returns_404(rules_client) -> None:
    client, _, _, _, _ = rules_client

    r = client.put("/api/categorization-rules/99999", json=_rule_payload())

    assert r.status_code == 404
    assert r.json() == {"detail": "Rule not found"}


def test_delete_is_idempotent_204(rules_client) -> None:
    client, _, _, _, _ = rules_client

    assert client.delete("/api/categorization-rules/99999").status_code == 204

    created = client.post("/api/categorization-rules", json=_rule_payload()).json()
    assert client.delete(f"/api/categorization-rules/{created['id']}").status_code == 204
    # Second delete of the same id is still 204.
    assert client.delete(f"/api/categorization-rules/{created['id']}").status_code == 204


def test_rules_are_user_scoped(rules_client) -> None:
    client, _, _, _, current = rules_client
    client.post("/api/categorization-rules", json=_rule_payload())
    rule_id = client.get("/api/categorization-rules").json()[0]["id"]

    current["user"] = _switch_user(rules_client, "b")
    as_b = client.get("/api/categorization-rules")

    assert as_b.status_code == 200
    assert as_b.json() == []
    # Cross-user PUT is a 404, never a 403 or a mutation.
    assert client.put(f"/api/categorization-rules/{rule_id}", json=_rule_payload()).status_code == (
        404
    )


def _switch_user(rules_client_tuple, which: str) -> User:
    _, _, user_a, user_b, _ = rules_client_tuple
    return user_b if which == "b" else user_a


def test_response_contract(rules_client) -> None:
    client, _, _, _, _ = rules_client

    created = client.post("/api/categorization-rules", json=_rule_payload())

    assert set(created.json().keys()) == RULE_KEYS
    listed = client.get("/api/categorization-rules").json()
    assert set(listed[0].keys()) == RULE_KEYS


# --- POST /apply ---


def test_apply_updates_category_and_rehashes_transaction_id(rules_client) -> None:
    client, session, user_a, _, _ = rules_client
    seeded = _seed_txn(session, user_a.id, "seed1", note="swiggy order", category="Misc")
    old_id = seeded.transaction_id
    client.post("/api/categorization-rules", json=_rule_payload(subcategory=None))

    r = client.post("/api/categorization-rules/apply")

    assert r.status_code == 200, r.json()
    body = r.json()
    assert body["matched"] == 1
    assert body["updated"] == 1
    assert "analytics_refreshed" in body

    session.expire_all()
    row = session.query(Transaction).filter(Transaction.user_id == user_a.id).one()
    assert row.category == "Food"
    assert row.subcategory is None
    assert row.transaction_id != old_id
    assert row.transaction_id == _recomputed_id(row, user_a.id)


def test_apply_skips_transfers_and_already_correct_rows(rules_client) -> None:
    client, session, user_a, _, _ = rules_client
    transfer = _seed_txn(
        session,
        user_a.id,
        "xfer1",
        note="swiggy wallet topup",
        category="Transfer: Cash -> Wallet",
        tx_type=TransactionType.TRANSFER,
    )
    transfer_id = transfer.transaction_id
    # Already at the rule's target category+subcategory.
    _seed_txn(session, user_a.id, "ok1", note="swiggy order", category="Food", subcategory=None)
    client.post("/api/categorization-rules", json=_rule_payload(subcategory=None))

    r = client.post("/api/categorization-rules/apply")

    body = r.json()
    assert body["matched"] == 1  # only the already-correct expense row
    assert body["updated"] == 0

    session.expire_all()
    xfer = session.get(Transaction, transfer_id)
    assert xfer is not None
    assert xfer.category == "Transfer: Cash -> Wallet"


def test_apply_migrates_transaction_tags_to_new_id(rules_client) -> None:
    client, session, user_a, _, _ = rules_client
    seeded = _seed_txn(session, user_a.id, "tagged1", note="swiggy order", category="Misc")
    old_id = seeded.transaction_id
    session.add(TransactionTag(user_id=user_a.id, transaction_id=old_id, tag="work"))
    session.commit()
    client.post("/api/categorization-rules", json=_rule_payload(subcategory=None))

    r = client.post("/api/categorization-rules/apply")

    assert r.json()["updated"] == 1
    session.expire_all()
    row = session.query(Transaction).filter(Transaction.user_id == user_a.id).one()
    assert row.transaction_id != old_id
    tags = session.query(TransactionTag).filter(TransactionTag.user_id == user_a.id).all()
    assert [(t.transaction_id, t.tag) for t in tags] == [(row.transaction_id, "work")]


def test_apply_handles_occurrence_collision(rules_client) -> None:
    client, session, user_a, _, _ = rules_client
    # Identical (date, amount, account, note) so both rehash to the same
    # base id once the rule sets the same category on both.
    _seed_txn(session, user_a.id, "dupA", note="swiggy order", category="MiscA")
    _seed_txn(session, user_a.id, "dupB", note="swiggy order", category="MiscB")
    client.post("/api/categorization-rules", json=_rule_payload(subcategory=None))

    r = client.post("/api/categorization-rules/apply")

    body = r.json()
    assert body["matched"] == 2
    assert body["updated"] == 2
    session.expire_all()
    rows = session.query(Transaction).filter(Transaction.user_id == user_a.id).all()
    assert len(rows) == 2
    ids = {row.transaction_id for row in rows}
    assert len(ids) == 2  # distinct final ids despite identical hash inputs
    assert all(row.category == "Food" for row in rows)
    recomputed = {_recomputed_id(rows[0], user_a.id, occurrence=n) for n in (0, 1)}
    assert ids == recomputed


def test_apply_rehash_avoids_soft_deleted_row_ids(rules_client) -> None:
    client, session, user_a, _, _ = rules_client
    live = _seed_txn(session, user_a.id, "live1", note="swiggy order", category="Misc")
    # A soft-deleted row already occupies the EXACT id the live row would
    # rehash to at occurrence 0 (typical full-snapshot re-upload leftovers).
    ghost_id = TransactionHasher().generate_transaction_id(
        date=live.date,
        amount=live.amount,
        account=live.account,
        note=live.note,
        category="Food",
        subcategory=None,
        tx_type=live.type.value,
        user_id=user_a.id,
        occurrence=0,
    )
    ghost = _seed_txn(session, user_a.id, ghost_id, note="swiggy order", category="Food")
    ghost.is_deleted = True
    session.commit()
    client.post("/api/categorization-rules", json=_rule_payload(subcategory=None))

    r = client.post("/api/categorization-rules/apply")

    # Was a duplicate-PK IntegrityError (HTTP 500) before soft-deleted rows
    # were included in the collision keyspace.
    assert r.status_code == 200, r.json()
    assert r.json()["updated"] == 1
    session.expire_all()
    row = (
        session.query(Transaction)
        .filter(Transaction.user_id == user_a.id, Transaction.is_deleted.is_(False))
        .one()
    )
    assert row.category == "Food"
    assert row.transaction_id != ghost_id
    assert row.transaction_id == _recomputed_id(row, user_a.id, occurrence=1)
    ghost_row = session.get(Transaction, ghost_id)
    assert ghost_row is not None
    assert ghost_row.is_deleted is True


def test_apply_migrates_anomalies_to_new_id(rules_client) -> None:
    client, session, user_a, _, _ = rules_client
    seeded = _seed_txn(session, user_a.id, "anom1", note="swiggy order", category="Misc")
    old_id = seeded.transaction_id
    session.add(
        Anomaly(
            user_id=user_a.id,
            anomaly_type=AnomalyType.HIGH_EXPENSE,
            severity="high",
            description="big spend",
            transaction_id=old_id,
            is_reviewed=True,
        )
    )
    session.commit()
    client.post("/api/categorization-rules", json=_rule_payload(subcategory=None))

    matched, updated = rules_engine.apply_rules_retroactively(session, user_a.id)

    assert (matched, updated) == (1, 1)
    session.expire_all()
    row = session.query(Transaction).filter(Transaction.user_id == user_a.id).one()
    anomaly = session.query(Anomaly).filter(Anomaly.user_id == user_a.id).one()
    assert row.transaction_id != old_id
    assert anomaly.transaction_id == row.transaction_id


def test_apply_batches_across_commit_chunks_and_restores_expire_on_commit(
    rules_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    client, session, user_a, _, _ = rules_client
    monkeypatch.setattr(rules_engine, "_COMMIT_CHUNK", 2)
    for n in range(5):
        _seed_txn(session, user_a.id, f"bulk{n}", note=f"swiggy order {n}", category="Misc")
    client.post("/api/categorization-rules", json=_rule_payload(subcategory=None))
    assert session.expire_on_commit is True  # sessionmaker default

    matched, updated = rules_engine.apply_rules_retroactively(session, user_a.id)

    assert (matched, updated) == (5, 5)
    assert session.expire_on_commit is True  # restored after the pass
    session.expire_all()
    rows = session.query(Transaction).filter(Transaction.user_id == user_a.id).all()
    assert len(rows) == 5
    assert all(row.category == "Food" for row in rows)
    assert all(row.transaction_id == _recomputed_id(row, user_a.id) for row in rows)


def test_apply_with_no_active_rules_returns_zero_counts(rules_client) -> None:
    client, session, user_a, _, _ = rules_client
    _seed_txn(session, user_a.id, "seed1", note="swiggy order", category="Misc")
    client.post("/api/categorization-rules", json=_rule_payload(is_active=False))

    r = client.post("/api/categorization-rules/apply")

    assert r.status_code == 200
    body = r.json()
    assert body["matched"] == 0
    assert body["updated"] == 0


def test_apply_only_touches_current_users_transactions(rules_client) -> None:
    client, session, _user_a, user_b, _ = rules_client
    b_txn = _seed_txn(session, user_b.id, "bseed", note="swiggy order", category="Misc")
    b_id = b_txn.transaction_id
    client.post("/api/categorization-rules", json=_rule_payload())  # rule belongs to user A

    r = client.post("/api/categorization-rules/apply")

    assert r.json()["matched"] == 0
    session.expire_all()
    b_row = session.get(Transaction, b_id)
    assert b_row is not None
    assert b_row.category == "Misc"


# --- Import-time application ---


def test_import_applies_rules_pre_hash_and_reupload_is_idempotent(rules_client) -> None:
    client, session, user_a, _, _ = rules_client
    client.post("/api/categorization-rules", json=_rule_payload(subcategory=None))
    rows = [
        {
            "date": "2026-06-01",
            "amount": 250.0,
            "currency": "INR",
            "type": "Expense",
            "account": "Cash",
            "category": "Misc",
            "subcategory": None,
            "note": "swiggy order",
        }
    ]
    engine = SyncEngine(session, user_id=user_a.id)

    first = engine.import_rows(rows, file_name="june.xlsx", file_hash="hash-1")

    assert first.inserted == 1
    stored = session.query(Transaction).filter(Transaction.user_id == user_a.id).one()
    assert stored.category == "Food"  # rule category, not the raw "Misc"
    assert stored.transaction_id == _recomputed_id(stored, user_a.id)

    # Re-uploading the identical rows is a no-op: rules ran pre-hash both
    # times, so the recomputed ids match and every row dedups.
    second = engine.import_rows(rows, file_name="june.xlsx", file_hash="hash-1", force=True)

    assert second.inserted == 0
    assert session.query(Transaction).filter(Transaction.user_id == user_a.id).count() == 1
