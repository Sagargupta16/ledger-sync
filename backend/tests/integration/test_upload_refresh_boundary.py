"""The HTTP import boundary honors analytics invalidation from the import engine."""

import threading
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import event, select

from ledger_sync.api.rate_limit import limiter
from ledger_sync.db.models import CategorizationRule, ImportLog, Transaction, TransactionType


def test_unchanged_forced_upload_keeps_published_summaries(two_user_client, monkeypatch):
    client, session, _, _, _ = two_user_client
    monkeypatch.setattr(limiter, "enabled", False)
    payload = {
        "file_name": "synthetic.csv",
        "file_hash": "d" * 64,
        "rows": [
            {
                "date": "2026-01-15",
                "amount": 1,
                "currency": "INR",
                "type": "Expense",
                "account": "Synthetic",
                "category": "Synthetic",
            }
        ],
    }
    first = client.post("/api/upload", json=payload)
    assert first.status_code == 200
    assert first.json()["analytics_status"] == "ready"
    writes = []

    def capture(_connection, _cursor, statement, _parameters, _context, _many):
        sql = statement.lower().lstrip()
        if sql.startswith(("delete", "insert", "update")) and any(
            table in sql for table in ("daily_summaries", "monthly_summaries")
        ):
            writes.append(sql.split()[0])

    event.listen(session.bind, "before_cursor_execute", capture)
    try:
        repeated = client.post("/api/upload", json={**payload, "force": True})
    finally:
        event.remove(session.bind, "before_cursor_execute", capture)
    assert repeated.status_code == 200
    assert repeated.json()["analytics_status"] == "ready"
    assert repeated.json()["stats"]["unchanged"] == 1
    assert writes == []


@pytest.mark.parametrize("rejection", ["duplicate", "legacy_rule", "ambiguous_legacy"])
def test_rejected_snapshot_releases_transaction_in_worker(two_user_client, monkeypatch, rejection):
    client, session, user, _, _ = two_user_client
    user_id = user.id
    monkeypatch.setattr(limiter, "enabled", False)
    legacy_id = "f" * 64
    session.add(
        Transaction(
            transaction_id=legacy_id,
            source_fingerprint=None,
            fingerprint_version=1,
            user_id=user_id,
            date=datetime(2026, 1, 15, tzinfo=UTC),
            amount=Decimal("1"),
            type=TransactionType.EXPENSE,
            currency="INR",
            account="Synthetic",
            category="Old label",
            source_file="legacy.csv",
        )
    )
    if rejection == "duplicate":
        session.add(ImportLog(user_id=user_id, file_hash="d" * 64, file_name="legacy.csv"))
    elif rejection == "legacy_rule":
        # Old stored rules can contain invalid output labels even though the
        # incoming row passes HTTP validation. Rejection happens after locking.
        session.add(
            CategorizationRule(
                user_id=user_id,
                match_field="account",
                pattern="Synthetic",
                category="",
            )
        )
    session.commit()
    row = {
        "date": "2026-01-15",
        "amount": 1,
        "type": "Expense",
        "account": "Synthetic",
        "category": "Source A",
    }
    rows = [row, {**row, "category": "Source B"}] if rejection == "ambiguous_legacy" else [row]
    lock_threads = []
    rollback_threads = []

    def capture_lock(_connection, _cursor, statement, _parameters, _context, _many):
        if statement.lower().startswith("update users"):
            lock_threads.append(threading.get_ident())

    def capture_rollback(_session, _previous_transaction):
        rollback_threads.append(threading.get_ident())

    event.listen(session.bind, "before_cursor_execute", capture_lock)
    event.listen(session, "after_soft_rollback", capture_rollback)
    try:
        response = client.post(
            "/api/upload",
            json={"file_name": "synthetic.csv", "file_hash": "d" * 64, "rows": rows},
        )
    finally:
        event.remove(session.bind, "before_cursor_execute", capture_lock)
        event.remove(session, "after_soft_rollback", capture_rollback)
    assert response.status_code == (409 if rejection == "duplicate" else 400)
    assert not session.in_transaction()
    assert lock_threads and rollback_threads
    assert all(thread == lock_threads[0] for thread in rollback_threads)
    legacy = session.get(Transaction, legacy_id)
    assert legacy.source_fingerprint is None
    assert legacy.category == "Old label"
    assert not legacy.is_deleted
    assert len(session.scalars(select(ImportLog)).all()) == (1 if rejection == "duplicate" else 0)
