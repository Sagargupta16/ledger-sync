"""Integration tests for reconciliation."""

from datetime import UTC, datetime
from decimal import Decimal

from ledger_sync.core.reconciler import Reconciler


class TestReconciler:
    """Test reconciliation logic."""

    def test_insert_new_transaction(self, test_db_session, sample_transaction_data):
        """Test inserting a new transaction."""
        reconciler = Reconciler(test_db_session)
        import_time = datetime.now(UTC)

        transaction, action = reconciler.reconcile_transaction(
            sample_transaction_data,
            "test.xlsx",
            import_time,
        )

        assert action == "inserted"
        assert transaction.amount == Decimal("100.50")
        assert transaction.category == "Food"

    def test_update_existing_transaction(self, test_db_session, sample_transaction_data):
        """Test updating an existing transaction."""
        reconciler = Reconciler(test_db_session)
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

        # Modify category
        modified_data = sample_transaction_data.copy()
        modified_data["category"] = "Shopping"

        import_time2 = datetime.now(UTC)
        transaction2, action2 = reconciler.reconcile_transaction(
            modified_data,
            "test.xlsx",
            import_time2,
        )

        assert action2 == "updated"
        assert transaction2.transaction_id == original_id
        assert transaction2.category == "Shopping"

    def test_skip_unchanged_transaction(self, test_db_session, sample_transaction_data):
        """Test skipping unchanged transaction."""
        reconciler = Reconciler(test_db_session)
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

    def test_soft_delete_stale_transactions(self, test_db_session, sample_transaction):
        """Test marking stale transactions as deleted."""
        reconciler = Reconciler(test_db_session)

        # Transaction exists with old timestamp
        assert sample_transaction.is_deleted is False

        # Import with newer timestamp
        import_time = datetime.utcnow()
        deleted_count = reconciler.mark_soft_deletes(import_time)

        test_db_session.refresh(sample_transaction)

        assert deleted_count == 1
        assert sample_transaction.is_deleted is True
