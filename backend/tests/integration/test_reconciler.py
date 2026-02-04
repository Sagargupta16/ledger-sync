"""Integration tests for reconciliation."""

from datetime import UTC, datetime
from decimal import Decimal

from ledger_sync.core.reconciler import Reconciler


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
