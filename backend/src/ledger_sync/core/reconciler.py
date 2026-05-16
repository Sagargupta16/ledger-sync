"""Transaction reconciliation logic."""

from datetime import datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ledger_sync.core.reconciler_helpers import (
    ReconciliationStats,
    are_enum_values_equal,
    are_string_values_equal,
    log_batch_duplicate,
    update_stats_for_action,
)
from ledger_sync.core.reconciler_transfers import TransferReconcilerMixin
from ledger_sync.db.models import Transaction, TransactionType
from ledger_sync.ingest.hash_id import TransactionHasher
from ledger_sync.utils.logging import logger

USER_ID_REQUIRED_MSG = "user_id is required for reconciliation"

__all__ = ["ReconciliationStats", "Reconciler"]


class Reconciler(TransferReconcilerMixin):
    """Reconciles Excel data with database."""

    def __init__(self, session: Session, user_id: int | None = None) -> None:
        """Initialize reconciler.

        Args:
            session: Database session
            user_id: ID of the authenticated user (required for multi-user mode)

        """
        self.session = session
        self.user_id = user_id
        self.hasher = TransactionHasher()

    def _ensure_user_id(self) -> int:
        """Validate that user_id is set and return it.

        Returns:
            The user_id value.

        Raises:
            ValueError: If user_id is not set.

        """
        if self.user_id is None:
            raise ValueError(USER_ID_REQUIRED_MSG)
        return self.user_id

    def _detect_and_apply_changes(
        self,
        existing: Transaction,
        normalized_row: dict[str, Any],
        updateable_fields: list[str],
    ) -> tuple[bool, list[str]]:
        """Detect and apply field changes between existing record and normalized data.

        Compares each updateable field between the existing DB record and the
        incoming normalized row. Enum fields (type) are compared case-insensitively;
        string fields treat None and empty string as equal. When a difference is
        found, the new value is applied via setattr.

        Args:
            existing: The existing Transaction record from the database
            normalized_row: Normalized data from the import
            updateable_fields: List of field names to compare and potentially update

        Returns:
            Tuple of (changed, changes_detected) where changed is True if any
            field was updated, and changes_detected is a list of human-readable
            change descriptions.

        """
        changed = False
        changes_detected: list[str] = []

        for field in updateable_fields:
            new_value = normalized_row[field]
            old_value = getattr(existing, field)

            if field == "type":
                values_equal = are_enum_values_equal(new_value, old_value)
            else:
                values_equal = are_string_values_equal(new_value, old_value)

            if not values_equal:
                changes_detected.append(f"{field}: {old_value!r} -> {new_value!r}")
                setattr(existing, field, new_value)
                changed = True

        return changed, changes_detected

    def _apply_existing_update(
        self,
        existing: Transaction,
        record_id: str,
        import_time: datetime,
        updateable_fields: list[str],
        normalized_row: dict[str, Any],
        log_level: str = "info",
    ) -> tuple[Transaction, str]:
        """Apply updates to an existing transaction/transfer and determine the action.

        Detects field changes, updates last_seen_at, restores soft-deleted records,
        and logs changes.

        Args:
            existing: The existing Transaction record from the database.
            record_id: The transaction/transfer ID for logging.
            import_time: Import timestamp.
            updateable_fields: List of field names to compare and potentially update.
            normalized_row: Normalized data from the import.
            log_level: Logging level for change messages ("info" or "debug").

        Returns:
            Tuple of (Transaction, action) where action is "updated" or "skipped".

        """
        changed, changes_detected = self._detect_and_apply_changes(
            existing, normalized_row, updateable_fields
        )

        # Always update last_seen_at and is_deleted
        existing.last_seen_at = import_time
        if existing.is_deleted:
            existing.is_deleted = False
            changed = True

        if not changed:
            # Still update last_seen_at even if nothing else changed
            return existing, "skipped"

        if changes_detected:
            changes_str = ", ".join(changes_detected)
            label = "Transfer" if log_level == "debug" else "Transaction"
            log_fn = logger.debug if log_level == "debug" else logger.info
            log_fn(f"{label} {record_id[:12]}... updated: {changes_str}")
        return existing, "updated"

    def _find_existing_record(self, record_id: str, user_id: int) -> Transaction | None:
        """Look up an existing transaction by ID and user.

        Args:
            record_id: The transaction/transfer ID.
            user_id: The user ID.

        Returns:
            The existing Transaction or None.

        """
        stmt = select(Transaction).where(
            Transaction.transaction_id == record_id,
            Transaction.user_id == user_id,
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def _batch_fetch_existing(self, record_ids: list[str], user_id: int) -> dict[str, Transaction]:
        """Batch-fetch existing transactions by IDs in a single query.

        Fetches in chunks of 500 to avoid SQL parameter limits.

        Args:
            record_ids: List of transaction/transfer IDs.
            user_id: The user ID.

        Returns:
            Dict mapping transaction_id -> Transaction for existing records.

        """
        existing: dict[str, Transaction] = {}
        chunk_size = 500
        for i in range(0, len(record_ids), chunk_size):
            chunk = record_ids[i : i + chunk_size]
            stmt = select(Transaction).where(
                Transaction.transaction_id.in_(chunk),
                Transaction.user_id == user_id,
            )
            for tx in self.session.execute(stmt).scalars():
                existing[tx.transaction_id] = tx
        return existing

    def reconcile_transaction(
        self,
        normalized_row: dict[str, Any],
        source_file: str,
        import_time: datetime,
        *,
        occurrence: int = 0,
    ) -> tuple[Transaction, str]:
        """Reconcile a single transaction.

        Args:
            normalized_row: Normalized transaction data
            source_file: Source file name
            import_time: Import timestamp
            occurrence: Zero-based duplicate index for hash disambiguation

        Returns:
            Tuple of (Transaction, action) where action is "inserted", "updated", or "skipped"

        Raises:
            ValueError: If user_id is not set in multi-user mode

        """
        user_id = self._ensure_user_id()

        # Generate transaction ID - include user_id for uniqueness per user
        transaction_id = self.hasher.generate_transaction_id(
            date=normalized_row["date"],
            amount=normalized_row["amount"],
            account=normalized_row["account"],
            note=normalized_row["note"],
            category=normalized_row["category"],
            subcategory=normalized_row["subcategory"],
            tx_type=normalized_row["type"],
            user_id=user_id,
            occurrence=occurrence,
        )

        existing = self._find_existing_record(transaction_id, user_id)

        if existing is None:
            # INSERT new transaction
            transaction = Transaction(
                transaction_id=transaction_id,
                user_id=user_id,
                date=normalized_row["date"],
                amount=normalized_row["amount"],
                currency=normalized_row["currency"],
                type=normalized_row["type"],
                account=normalized_row["account"],
                category=normalized_row["category"],
                subcategory=normalized_row["subcategory"],
                note=normalized_row["note"],
                source_file=source_file,
                last_seen_at=import_time,
                is_deleted=False,
            )
            self.session.add(transaction)
            return transaction, "inserted"

        # UPDATE existing transaction
        updateable_fields = ["category", "subcategory", "note", "type"]
        return self._apply_existing_update(
            existing, transaction_id, import_time, updateable_fields, normalized_row
        )

    def mark_soft_deletes(self, import_time: datetime) -> int:
        """Mark transactions not seen in this import as deleted.

        Note: Excludes transfers as they are handled separately by mark_soft_deletes_transfers.

        Args:
            import_time: Import timestamp

        Returns:
            Number of transactions marked as deleted

        """
        user_id = self._ensure_user_id()

        stmt = (
            update(Transaction)
            .where(Transaction.user_id == user_id)
            .where(Transaction.last_seen_at < import_time)
            .where(Transaction.is_deleted.is_(False))
            .where(Transaction.type != TransactionType.TRANSFER)
            .values(is_deleted=True)
            .execution_options(synchronize_session="fetch")
        )
        result = self.session.execute(stmt)
        count = int(result.rowcount)  # type: ignore[attr-defined]

        if count > 0:
            logger.info(f"Marked {count} transactions as deleted")

        return count

    def _process_transaction_row(
        self,
        row: dict[str, Any],
        seen_in_batch: dict[str, int],
        stats: ReconciliationStats,
        source_file: str,
        import_time: datetime,
    ) -> None:
        """Process a single income/expense row in a batch reconciliation.

        Uses an occurrence counter so that genuinely duplicate rows (identical
        date, amount, account, note, category, subcategory, type) each get a
        unique hash instead of being silently dropped.

        Args:
            row: Normalized row data.
            seen_in_batch: Dict mapping base hash IDs to occurrence counts.
            stats: Stats object to update.
            source_file: Source file name.
            import_time: Import timestamp.

        """
        base_id = self.hasher.generate_transaction_id(
            date=row["date"],
            amount=row["amount"],
            account=row["account"],
            note=row["note"],
            category=row["category"],
            subcategory=row["subcategory"],
            tx_type=row["type"],
            user_id=self.user_id,
        )

        # Track how many times we've seen this base hash in the current batch.
        # The first occurrence (0) keeps the original hash for backward compat.
        # Subsequent occurrences get a new hash with the occurrence index.
        occurrence = seen_in_batch.get(base_id, 0)
        seen_in_batch[base_id] = occurrence + 1

        _, action = self.reconcile_transaction(
            row,
            source_file,
            import_time,
            occurrence=occurrence,
        )

        stats.processed += 1
        update_stats_for_action(stats, action)

    def _process_transfer_row(
        self,
        row: dict[str, Any],
        seen_in_batch: set[str],
        stats: ReconciliationStats,
        source_file: str,
        import_time: datetime,
    ) -> None:
        """Process a single transfer row in a batch reconciliation.

        Transfers in the Excel appear as dual entries (Transfer-In and
        Transfer-Out) for the same real transfer. Both produce the same hash
        since the normalizer maps them to identical from/to accounts. The
        second entry is skipped to avoid double-counting.

        Args:
            row: Normalized row data.
            seen_in_batch: Set of hash IDs already seen in this batch.
            stats: Stats object to update.
            source_file: Source file name.
            import_time: Import timestamp.

        """
        record_id = self.hasher.generate_transaction_id(
            date=row["date"],
            amount=row["amount"],
            account=row["from_account"],
            note=row["note"],
            category=row["category"],
            subcategory=row["subcategory"],
            tx_type=row["type"],
            user_id=self.user_id,
        )

        if record_id in seen_in_batch:
            log_batch_duplicate(row, record_id, is_transfer=True)
            stats.processed += 1
            stats.skipped += 1
            return

        seen_in_batch.add(record_id)

        _, action = self.reconcile_transfer(row, source_file, import_time)

        stats.processed += 1
        update_stats_for_action(stats, action)

    def reconcile_batch(
        self,
        normalized_rows: list[dict[str, Any]],
        source_file: str,
        import_time: datetime,
    ) -> ReconciliationStats:
        """Reconcile a batch of transactions.

        Uses batch-fetch to pre-load all existing records in one query,
        avoiding N+1 SELECT overhead on high-latency connections.

        Args:
            normalized_rows: List of normalized transaction data
            source_file: Source file name
            import_time: Import timestamp

        Returns:
            Reconciliation statistics

        Raises:
            ValueError: If user_id is not set in multi-user mode

        """
        user_id = self._ensure_user_id()

        stats = ReconciliationStats()

        # Phase 1: Pre-compute all transaction IDs (in-memory, no DB)
        seen_in_batch: dict[str, int] = {}
        row_ids: list[str] = []
        for row in normalized_rows:
            try:
                base_id = self.hasher.generate_transaction_id(
                    date=row["date"],
                    amount=row["amount"],
                    account=row["account"],
                    note=row["note"],
                    category=row["category"],
                    subcategory=row["subcategory"],
                    tx_type=row["type"],
                    user_id=user_id,
                )
                occurrence = seen_in_batch.get(base_id, 0)
                seen_in_batch[base_id] = occurrence + 1
                actual_id = self.hasher.generate_transaction_id(
                    date=row["date"],
                    amount=row["amount"],
                    account=row["account"],
                    note=row["note"],
                    category=row["category"],
                    subcategory=row["subcategory"],
                    tx_type=row["type"],
                    user_id=user_id,
                    occurrence=occurrence,
                )
                row_ids.append(actual_id)
            except (ValueError, TypeError, KeyError) as e:
                logger.error("Error computing ID for transaction: %s", e)
                row_ids.append("")

        # Phase 2: Batch-fetch all existing records (1-2 queries instead of N)
        valid_ids = [rid for rid in row_ids if rid]
        existing_map = self._batch_fetch_existing(valid_ids, user_id)

        # Phase 3: Process each row using pre-fetched data
        updateable_fields = ["category", "subcategory", "note", "type"]
        for idx, row in enumerate(normalized_rows):
            tx_id = row_ids[idx]
            if not tx_id:
                continue

            stats.processed += 1
            existing = existing_map.get(tx_id)

            if existing is None:
                transaction = Transaction(
                    transaction_id=tx_id,
                    user_id=user_id,
                    date=row["date"],
                    amount=row["amount"],
                    currency=row["currency"],
                    type=row["type"],
                    account=row["account"],
                    category=row["category"],
                    subcategory=row["subcategory"],
                    note=row["note"],
                    source_file=source_file,
                    last_seen_at=import_time,
                    is_deleted=False,
                )
                self.session.add(transaction)
                stats.inserted += 1
            else:
                _, action = self._apply_existing_update(
                    existing,
                    tx_id,
                    import_time,
                    updateable_fields,
                    row,
                )
                update_stats_for_action(stats, action)

        # Commit all changes
        self.session.commit()

        # Mark soft deletes
        stats.deleted = self.mark_soft_deletes(import_time)
        self.session.commit()

        return stats
