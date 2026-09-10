"""Integration tests for reconciliation."""

from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import event, select

from ledger_sync.core.reconciler import Reconciler
from ledger_sync.core.sync_engine import AlreadyImportedError, SyncEngine
from ledger_sync.db.models import ImportLog, Transaction, TransactionType
from ledger_sync.ingest.normalizer import NormalizationError


class TestReconciler:
    """Test reconciliation logic."""

    def test_insert_new_transaction(self, test_db_session, sample_transaction_data, test_user):
        """Test inserting a new transaction."""
        reconciler = Reconciler(test_db_session, user_id=test_user.id)
        import_time = datetime.now(UTC)

        transaction, action = reconciler.reconcile_transaction(
            sample_transaction_data,
            "test.xlsx",
            import_time,
        )

        assert action == "inserted"
        assert transaction.amount == Decimal("100.50")
        assert transaction.category == "Food"
        assert transaction.user_id == test_user.id

    def test_update_existing_transaction(self, test_db_session, sample_transaction_data, test_user):
        """Test updating an existing transaction when it was soft-deleted.

        Note: The transaction ID is a hash of (date, amount, account, note, category,
        subcategory, type). So changing any of these creates a NEW transaction.
        The only way to 'update' is if the same transaction was previously soft-deleted.
        """
        reconciler = Reconciler(test_db_session, user_id=test_user.id)
        import_time1 = datetime.now(UTC)

        # First import
        transaction1, action1 = reconciler.reconcile_transaction(
            sample_transaction_data,
            "test.xlsx",
            import_time1,
        )
        test_db_session.commit()

        assert action1 == "inserted"
        original_id = transaction1.transaction_id

        # Soft delete the transaction
        transaction1.is_deleted = True
        test_db_session.commit()

        # Re-import the same transaction (should restore it)
        import_time2 = datetime.now(UTC)
        transaction2, action2 = reconciler.reconcile_transaction(
            sample_transaction_data,
            "test.xlsx",
            import_time2,
        )

        assert action2 == "updated"
        assert transaction2.transaction_id == original_id
        assert transaction2.is_deleted is False

    def test_skip_unchanged_transaction(self, test_db_session, sample_transaction_data, test_user):
        """Test skipping unchanged transaction."""
        reconciler = Reconciler(test_db_session, user_id=test_user.id)
        import_time1 = datetime.now(UTC)

        # First import
        transaction1, action1 = reconciler.reconcile_transaction(
            sample_transaction_data,
            "test.xlsx",
            import_time1,
        )
        test_db_session.commit()

        assert action1 == "inserted"

        import_time2 = datetime.now(UTC)
        transaction2, action2 = reconciler.reconcile_transaction(
            sample_transaction_data,
            "test.xlsx",
            import_time2,
        )

        assert action2 == "skipped"
        assert transaction1.transaction_id == transaction2.transaction_id

    def test_soft_delete_stale_transactions(self, test_db_session, sample_transaction, test_user):
        """Test marking stale transactions as deleted."""
        reconciler = Reconciler(test_db_session, user_id=test_user.id)

        # Transaction exists with old timestamp
        assert sample_transaction.is_deleted is False

        # Import with newer timestamp
        import_time = datetime.now(UTC)
        deleted_count = reconciler.mark_soft_deletes(import_time)

        # Commit the changes made by mark_soft_deletes
        test_db_session.commit()

        # Expire the cached object state and refresh from database
        test_db_session.expire(sample_transaction)
        test_db_session.refresh(sample_transaction)

        assert deleted_count == 1
        assert sample_transaction.is_deleted is True


def _snapshot_row(**changes) -> dict:
    return {
        "date": "2026-01-15",
        "amount": 100,
        "currency": "INR",
        "type": "Expense",
        "account": "Cash",
        "category": "Food",
        "note": None,
        **changes,
    }


@pytest.mark.parametrize(
    "bad_row",
    [
        _snapshot_row(date="2026-02-30"),
        _snapshot_row(amount="100abc"),
        _snapshot_row(amount=float("inf")),
        _snapshot_row(amount="NaN"),
        _snapshot_row(currency="USD"),
        _snapshot_row(account=" \x00 "),
        _snapshot_row(category=None),
    ],
)
def test_invalid_snapshot_performs_no_writes(test_db_session, test_user, bad_row):
    engine = SyncEngine(test_db_session, user_id=test_user.id)
    engine.import_rows([_snapshot_row(), _snapshot_row(amount=200)], "initial.csv", "initial")
    writes = []

    def record_write(_conn, _cursor, statement, _parameters, _context, _many):
        if statement.lstrip().split(" ", 1)[0].upper() in {"INSERT", "UPDATE", "DELETE"}:
            writes.append(statement)

    event.listen(test_db_session.bind, "before_cursor_execute", record_write)
    try:
        invalid_rows = [_snapshot_row(), bad_row]
        with pytest.raises(NormalizationError, match="Row 3"):
            engine.import_rows(invalid_rows, "invalid.csv", "invalid")
    finally:
        event.remove(test_db_session.bind, "before_cursor_execute", record_write)

    assert writes == []
    assert (
        len(
            test_db_session.scalars(
                select(Transaction).where(Transaction.is_deleted.is_(False))
            ).all()
        )
        == 2
    )
    assert len(test_db_session.scalars(select(ImportLog)).all()) == 1


@pytest.mark.parametrize("failure_stage", ["transfers", "commit"])
def test_snapshot_failure_rolls_back_ledger_and_forced_import_log(
    test_db_session, test_user, monkeypatch, failure_stage
):
    engine = SyncEngine(test_db_session, user_id=test_user.id)
    engine.import_rows(
        [_snapshot_row(), _snapshot_row(type="Transfer-Out", category="Savings")],
        "initial.csv",
        "same-hash",
    )
    original_ids = set(test_db_session.scalars(select(Transaction.transaction_id)))
    original_log_id = test_db_session.scalar(select(ImportLog.id))

    def fail_commit():
        raise RuntimeError("synthetic final commit failure")

    original_reconcile = engine.reconciler.reconcile_transfers_batch

    def fail_transfers(*args, **kwargs):
        original_reconcile(*args, **kwargs)
        raise RuntimeError("synthetic failure after transfer deletion")

    if failure_stage == "commit":
        monkeypatch.setattr(test_db_session, "commit", fail_commit)
    else:
        monkeypatch.setattr(engine.reconciler, "reconcile_transfers_batch", fail_transfers)

    replacement_rows = [_snapshot_row(amount=300)]
    with pytest.raises(RuntimeError, match="synthetic"):
        engine.import_rows(replacement_rows, "replacement.csv", "same-hash", force=True)

    rows = test_db_session.scalars(select(Transaction)).all()
    assert {row.transaction_id for row in rows} == original_ids
    assert all(not row.is_deleted and row.amount == Decimal("100.00") for row in rows)
    logs = test_db_session.scalars(select(ImportLog)).all()
    assert len(logs) == 1
    assert logs[0].id == original_log_id
    assert logs[0].file_name == "initial.csv"


@pytest.mark.parametrize("remaining_type", ["Expense", "Transfer-Out"])
def test_snapshot_removes_empty_group_without_touching_other_users(
    test_db_session, test_user, make_user, remaining_type
):
    engine = SyncEngine(test_db_session, user_id=test_user.id)
    engine.import_rows(
        [_snapshot_row(), _snapshot_row(type="Transfer-Out", category="Savings")],
        "initial.csv",
        "initial",
    )
    other_user = make_user("other-import@example.com")
    SyncEngine(test_db_session, user_id=other_user.id).import_rows(
        [_snapshot_row()], "other.csv", "other"
    )
    remaining = _snapshot_row(
        type=remaining_type, category="Savings" if remaining_type == "Transfer-Out" else "Food"
    )
    stats = engine.import_rows([remaining], "replacement.csv", "replacement")
    live_rows = test_db_session.scalars(
        select(Transaction).where(
            Transaction.user_id == test_user.id, Transaction.is_deleted.is_(False)
        )
    ).all()

    assert stats.deleted == 1
    assert len(live_rows) == 1
    expected_type = (
        TransactionType.TRANSFER if remaining_type == "Transfer-Out" else TransactionType.EXPENSE
    )
    assert live_rows[0].type == expected_type
    assert (
        test_db_session.scalar(
            select(Transaction.is_deleted).where(Transaction.user_id == other_user.id)
        )
        is False
    )


def test_duplicate_file_and_duplicate_row_behavior_is_preserved(test_db_session, test_user):
    engine = SyncEngine(test_db_session, user_id=test_user.id)
    rows = [
        _snapshot_row(),
        _snapshot_row(),
        _snapshot_row(type="Transfer-Out", category="Savings"),
        _snapshot_row(type="Transfer-In", account="Savings", category="Cash"),
    ]
    first = engine.import_rows(rows, "snapshot.csv", "same-hash")
    original_ids = set(test_db_session.scalars(select(Transaction.transaction_id)))
    assert first.inserted == 3
    assert first.skipped == 1

    with pytest.raises(AlreadyImportedError):
        engine.import_rows(rows, "snapshot.csv", "same-hash")

    forced = engine.import_rows(rows, "snapshot.csv", "same-hash", force=True)
    assert forced.processed == 4
    assert forced.inserted == forced.updated == forced.deleted == 0
    assert forced.skipped == 4
    assert set(test_db_session.scalars(select(Transaction.transaction_id))) == original_ids
    assert len(test_db_session.scalars(select(ImportLog)).all()) == 1


@pytest.mark.parametrize("transaction_type", ["Expense", "Transfer-Out"])
def test_currency_correction_updates_existing_id(test_db_session, test_user, transaction_type):
    engine = SyncEngine(test_db_session, user_id=test_user.id)
    rows = [_snapshot_row(type=transaction_type)]
    engine.import_rows(rows, "initial.csv", "initial")
    stored = test_db_session.scalar(select(Transaction))
    original_id = stored.transaction_id
    stored.currency = "USD"
    test_db_session.commit()

    stats = engine.import_rows(rows, "corrected.csv", "corrected")

    assert stats.updated == 1
    assert stats.inserted == stats.deleted == 0
    stored = test_db_session.scalar(select(Transaction))
    assert stored.transaction_id == original_id
    assert stored.currency == "INR"
