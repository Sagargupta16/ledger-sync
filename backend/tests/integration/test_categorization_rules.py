"""Integration tests for the /api/categorization-rules endpoints.

Rules change classification while preserving public IDs, source fingerprints,
and annotation references. A retroactive batch commits atomically; import
fingerprints are captured before rules, so raw reuploads remain idempotent.

TestClient with dependency overrides for get_session and get_current_user.
SQLite in-memory with StaticPool + check_same_thread=False so the test
session and the request handler thread share one connection (and therefore
the same in-memory database).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from hashlib import sha256
from typing import Any

import pytest
from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from ledger_sync.core import rules as rules_engine
from ledger_sync.core.analytics.refresh import get_analytics_state
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
    # Synthetic source identities must satisfy the database's SHA-256 shape.
    transaction_id = (
        tx_id if len(tx_id) == 64 else sha256(f"{user_id}:{tx_id}".encode()).hexdigest()
    )
    txn = Transaction(
        transaction_id=transaction_id,
        source_fingerprint=transaction_id,
        fingerprint_version=2,
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


def _classification_fingerprint(txn: Transaction, user_id: int) -> str:
    """Hash current display fields, which need not match the stored source identity."""
    return TransactionHasher().generate_transaction_id(
        date=txn.date,
        amount=txn.amount,
        account=txn.account,
        note=txn.note,
        category=txn.category,
        subcategory=txn.subcategory,
        tx_type=txn.type.value,
        user_id=user_id,
        to_account=txn.to_account,
        currency=txn.currency,
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


def test_apply_changes_category_and_preserves_source_identity(rules_client) -> None:
    client, session, user_a, _, _ = rules_client
    seeded = _seed_txn(session, user_a.id, "seed1", note="swiggy order", category="Misc")
    old_id = seeded.transaction_id
    source_fingerprint = seeded.source_fingerprint
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
    assert row.transaction_id == old_id
    assert row.source_fingerprint == source_fingerprint
    assert row.fingerprint_version == 2
    assert row.transaction_id != _classification_fingerprint(row, user_a.id)


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


def test_apply_preserves_tag_rows_and_transaction_references(rules_client) -> None:
    client, session, user_a, _, _ = rules_client
    seeded = _seed_txn(session, user_a.id, "tagged1", note="swiggy order", category="Misc")
    old_id = seeded.transaction_id
    tag = TransactionTag(user_id=user_a.id, transaction_id=old_id, tag="work")
    session.add(tag)
    session.commit()
    tag_id = tag.id
    client.post("/api/categorization-rules", json=_rule_payload(subcategory=None))

    r = client.post("/api/categorization-rules/apply")

    assert r.json()["updated"] == 1
    session.expire_all()
    row = session.query(Transaction).filter(Transaction.user_id == user_a.id).one()
    assert row.transaction_id == old_id
    assert row.source_fingerprint == old_id
    tags = session.query(TransactionTag).filter(TransactionTag.user_id == user_a.id).all()
    assert [(t.id, t.transaction_id, t.tag) for t in tags] == [(tag_id, old_id, "work")]


def test_apply_retains_distinct_source_rows_with_identical_final_classification(
    rules_client,
) -> None:
    client, session, user_a, _, _ = rules_client
    # The rule makes all display/hash fields equal, but these remain two records.
    first = _seed_txn(session, user_a.id, "dupA", note="swiggy order", category="MiscA")
    second = _seed_txn(session, user_a.id, "dupB", note="swiggy order", category="MiscB")
    identities = {row.transaction_id: row.source_fingerprint for row in (first, second)}
    client.post("/api/categorization-rules", json=_rule_payload(subcategory=None))

    r = client.post("/api/categorization-rules/apply")

    body = r.json()
    assert body["matched"] == 2
    assert body["updated"] == 2
    session.expire_all()
    rows = session.query(Transaction).filter(Transaction.user_id == user_a.id).all()
    assert len(rows) == 2
    assert {row.transaction_id: row.source_fingerprint for row in rows} == identities
    assert all(row.category == "Food" for row in rows)
    assert len({_classification_fingerprint(row, user_a.id) for row in rows}) == 1


def test_apply_preserves_identity_when_classification_hash_matches_deleted_row(
    rules_client,
) -> None:
    client, session, user_a, _, _ = rules_client
    live = _seed_txn(session, user_a.id, "live1", note="swiggy order", category="Misc")
    live_id = live.transaction_id
    # A deleted row's ID matches the future display-field hash. Rules no longer
    # rehash, so it must neither replace that ghost nor allocate an occurrence ID.
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

    assert r.status_code == 200, r.json()
    assert r.json()["updated"] == 1
    session.expire_all()
    row = (
        session.query(Transaction)
        .filter(Transaction.user_id == user_a.id, Transaction.is_deleted.is_(False))
        .one()
    )
    assert row.category == "Food"
    assert row.transaction_id == live_id
    assert row.source_fingerprint == live_id
    assert row.transaction_id != ghost_id
    assert _classification_fingerprint(row, user_a.id) == ghost_id
    ghost_row = session.get(Transaction, ghost_id)
    assert ghost_row is not None
    assert ghost_row.is_deleted is True
    assert ghost_row.source_fingerprint == ghost_id


def test_apply_preserves_anomaly_identity_review_and_transaction_reference(rules_client) -> None:
    client, session, user_a, _, _ = rules_client
    seeded = _seed_txn(session, user_a.id, "anom1", note="swiggy order", category="Misc")
    old_id = seeded.transaction_id
    anomaly = Anomaly(
        user_id=user_a.id,
        anomaly_type=AnomalyType.HIGH_EXPENSE,
        severity="high",
        description="big spend",
        transaction_id=old_id,
        is_reviewed=True,
    )
    session.add(anomaly)
    session.commit()
    anomaly_id = anomaly.id
    client.post("/api/categorization-rules", json=_rule_payload(subcategory=None))

    matched, updated = rules_engine.apply_rules_retroactively(session, user_a.id)

    assert (matched, updated) == (1, 1)
    session.expire_all()
    row = session.query(Transaction).filter(Transaction.user_id == user_a.id).one()
    anomaly = session.query(Anomaly).filter(Anomaly.user_id == user_a.id).one()
    assert row.transaction_id == old_id
    assert row.source_fingerprint == old_id
    assert anomaly.id == anomaly_id
    assert anomaly.transaction_id == old_id
    assert anomaly.is_reviewed is True
    assert anomaly.description == "big spend"


@pytest.mark.parametrize("expire_on_commit", [True, False])
def test_apply_bulk_commits_once_and_preserves_identity_and_expiration_setting(
    rules_client, expire_on_commit: bool
) -> None:
    client, session, user_a, _, _ = rules_client
    rows = [
        _seed_txn(session, user_a.id, f"bulk{n:04d}", note=f"swiggy order {n}", category="Misc")
        for n in range(501)
    ]
    identities = {row.transaction_id: row.source_fingerprint for row in rows}
    client.post("/api/categorization-rules", json=_rule_payload(subcategory=None))
    session.expire_on_commit = expire_on_commit
    commits = []

    def record_commit(committed_session: Session) -> None:
        commits.append(committed_session)

    event.listen(session, "after_commit", record_commit)
    try:
        matched, updated = rules_engine.apply_rules_retroactively(session, user_a.id)
    finally:
        event.remove(session, "after_commit", record_commit)

    assert (matched, updated) == (501, 501)
    assert commits == [session]
    assert session.expire_on_commit is expire_on_commit
    assert all(inspect(row).expired is expire_on_commit for row in rows)
    session.expire_all()
    rows = session.query(Transaction).filter(Transaction.user_id == user_a.id).all()
    assert len(rows) == 501
    assert all(row.category == "Food" for row in rows)
    assert {row.transaction_id: row.source_fingerprint for row in rows} == identities


def test_apply_bulk_rolls_back_all_classifications_and_invalidation_on_failure(
    rules_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    client, session, user_a, _, _ = rules_client
    rows = [
        _seed_txn(session, user_a.id, f"rollback{n}", note=f"swiggy order {n}", category="Misc")
        for n in range(5)
    ]
    identities = {row.transaction_id: row.source_fingerprint for row in rows}
    client.post("/api/categorization-rules", json=_rule_payload(subcategory=None))
    assert get_analytics_state(session, user_a.id) is None
    mark_changed = rules_engine.mark_ledger_changed

    def fail_after_flush(*args: Any, **kwargs: Any) -> None:
        mark_changed(*args, **kwargs)
        session.flush()
        raise RuntimeError("Synthetic invalidation failure")

    monkeypatch.setattr(rules_engine, "mark_ledger_changed", fail_after_flush)
    with pytest.raises(RuntimeError, match="Synthetic invalidation failure"):
        rules_engine.apply_rules_retroactively(session, user_a.id)

    session.expire_all()
    rows = session.query(Transaction).filter(Transaction.user_id == user_a.id).all()
    assert {row.transaction_id: row.source_fingerprint for row in rows} == identities
    assert all(row.category == "Misc" and row.subcategory is None for row in rows)
    assert get_analytics_state(session, user_a.id) is None


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


def test_import_captures_source_identity_before_rules_and_raw_reupload_is_idempotent(
    rules_client,
) -> None:
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
    raw_fingerprint = TransactionHasher().generate_transaction_id(
        date=stored.date,
        amount=Decimal("250.00"),
        account="Cash",
        note="swiggy order",
        category="Misc",
        subcategory=None,
        tx_type="Expense",
        user_id=user_a.id,
    )
    stored_id = stored.transaction_id
    assert stored_id == stored.source_fingerprint == raw_fingerprint
    assert stored.fingerprint_version == 2
    assert stored_id != _classification_fingerprint(stored, user_a.id)

    # The second raw import resolves the same source identity, despite the
    # category in storage differing from the source's original "Misc".
    second = engine.import_rows(rows, file_name="june.xlsx", file_hash="hash-1", force=True)

    assert second.inserted == 0
    assert second.updated == 0
    assert second.deleted == 0
    assert session.query(Transaction).filter(Transaction.user_id == user_a.id).count() == 1
    session.expire_all()
    stored = session.get(Transaction, stored_id)
    assert stored is not None
    assert stored.source_fingerprint == raw_fingerprint
    assert stored.category == "Food"
    assert stored.subcategory is None
    assert stored.is_deleted is False
