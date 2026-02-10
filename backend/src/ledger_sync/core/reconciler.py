"""Transaction reconciliation logic."""

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.db.models import Transaction, TransactionType
from ledger_sync.ingest.hash_id import TransactionHasher
from ledger_sync.utils.logging import logger

USER_ID_REQUIRED_MSG = "user_id is required for reconciliation"


class ReconciliationStats:
    """Statistics from reconciliation process."""

    def __init__(self) -> None:
        """Initialize stats."""
        self.processed = 0
        self.inserted = 0
        self.updated = 0
        self.deleted = 0
        self.skipped = 0

    def __repr__(self) -> str:
        """Return string representation."""
        return (
            f"ReconciliationStats(processed={self.processed}, "
            f"inserted={self.inserted}, updated={self.updated}, "
            f"deleted={self.deleted}, skipped={self.skipped})"
        )


class Reconciler:
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

    @staticmethod
    def _normalize_enum_value(value: Any) -> str | None:
        """Extract a comparable string from an enum or raw value.

        Args:
            value: An enum instance, string, or None.

        Returns:
            Upper-cased string representation, or None if the value is falsy.

        """
        if hasattr(value, "value"):
            return value.value
        if value:
            return str(value)
        return None

    @staticmethod
    def _are_enum_values_equal(new_value: Any, old_value: Any) -> bool:
        """Compare two enum-like values case-insensitively.

        Args:
            new_value: The new value (may be an enum, string, or None).
            old_value: The old value (may be an enum, string, or None).

        Returns:
            True if the values are considered equal.

        """
        new_str = Reconciler._normalize_enum_value(new_value)
        old_str = Reconciler._normalize_enum_value(old_value)
        new_upper = new_str.upper() if new_str else None
        old_upper = old_str.upper() if old_str else None
        return new_upper == old_upper

    @staticmethod
    def _are_string_values_equal(new_value: Any, old_value: Any) -> bool:
        """Compare two string values, treating None and empty string as equal.

        Args:
            new_value: The new value.
            old_value: The old value.

        Returns:
            True if the values are considered equal.

        """
        new_normalized = new_value if new_value else None
        old_normalized = old_value if old_value else None
        return new_normalized == old_normalized

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
                values_equal = self._are_enum_values_equal(new_value, old_value)
            else:
                values_equal = self._are_string_values_equal(new_value, old_value)

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

    @staticmethod
    def _update_stats_for_action(stats: ReconciliationStats, action: str) -> None:
        """Increment the appropriate stat counter based on reconciliation action.

        Args:
            stats: The stats object to update.
            action: One of "inserted", "updated", or "skipped".

        """
        if action == "inserted":
            stats.inserted += 1
        elif action == "updated":
            stats.updated += 1
        elif action == "skipped":
            stats.skipped += 1

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

        # Find transactions that weren't seen in this import (excluding transfers)
        # Filter by user
        stmt = (
            select(Transaction)
            .where(Transaction.user_id == user_id)
            .where(Transaction.last_seen_at < import_time)
            .where(Transaction.is_deleted.is_(False))
            .where(Transaction.type != TransactionType.TRANSFER)
        )

        stale_transactions = self.session.execute(stmt).scalars().all()

        count = 0
        for transaction in stale_transactions:
            transaction.is_deleted = True
            count += 1

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
        self._update_stats_for_action(stats, action)

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
            self._log_batch_duplicate(row, record_id, is_transfer=True)
            stats.processed += 1
            stats.skipped += 1
            return

        seen_in_batch.add(record_id)

        _, action = self.reconcile_transfer(row, source_file, import_time)

        stats.processed += 1
        self._update_stats_for_action(stats, action)

    @staticmethod
    def _log_batch_duplicate(row: dict[str, Any], record_id: str, is_transfer: bool) -> None:
        """Log a warning about a duplicate record found within a batch.

        Args:
            row: The duplicate row data.
            record_id: The generated hash ID.
            is_transfer: Whether this row is a transfer.

        """
        if is_transfer:
            logger.warning(
                f"Skipping duplicate transfer in batch: {record_id[:16]}... "
                f"(Date: {row['date']}, Amount: {row['amount']}, "
                f"From: {row['from_account']}, To: {row['to_account']})",
            )
        else:
            logger.warning(
                f"Skipping duplicate transaction in batch: {record_id[:16]}... "
                f"(Date: {row['date']}, Amount: {row['amount']}, "
                f"Account: {row['account']}, Category: {row['category']}, "
                f"Type: {row['type']})",
            )

    def reconcile_batch(
        self,
        normalized_rows: list[dict[str, Any]],
        source_file: str,
        import_time: datetime,
    ) -> ReconciliationStats:
        """Reconcile a batch of transactions.

        Args:
            normalized_rows: List of normalized transaction data
            source_file: Source file name
            import_time: Import timestamp

        Returns:
            Reconciliation statistics

        Raises:
            ValueError: If user_id is not set in multi-user mode

        """
        self._ensure_user_id()

        stats = ReconciliationStats()
        seen_in_batch: dict[str, int] = {}

        for row in normalized_rows:
            try:
                self._process_transaction_row(
                    row,
                    seen_in_batch,
                    stats,
                    source_file,
                    import_time,
                )
            except (ValueError, TypeError, KeyError) as e:
                logger.error("Error reconciling transaction: %s", e)
                continue

        # Commit all changes
        self.session.commit()

        # Mark soft deletes
        stats.deleted = self.mark_soft_deletes(import_time)
        self.session.commit()

        return stats

    def reconcile_transfer(
        self,
        normalized_row: dict[str, Any],
        source_file: str,
        import_time: datetime,
    ) -> tuple[Transaction, str]:
        """Reconcile a single transfer (now stored as Transaction with type='Transfer').

        Args:
            normalized_row: Normalized transfer data
            source_file: Source file name
            import_time: Import timestamp

        Returns:
            Tuple of (Transaction, action) where action is "inserted", "updated", or "skipped"

        Raises:
            ValueError: If user_id is not set in multi-user mode

        """
        user_id = self._ensure_user_id()

        # Generate transfer ID (using from_account as account for hash)
        transfer_id = self.hasher.generate_transaction_id(
            date=normalized_row["date"],
            amount=normalized_row["amount"],
            account=normalized_row["from_account"],
            note=normalized_row["note"],
            category=normalized_row["category"],
            subcategory=normalized_row["subcategory"],
            tx_type=normalized_row["type"],
            user_id=user_id,
        )

        existing = self._find_existing_record(transfer_id, user_id)

        if existing is None:
            # INSERT new transfer as Transaction
            transfer = Transaction(
                transaction_id=transfer_id,
                user_id=user_id,
                date=normalized_row["date"],
                amount=normalized_row["amount"],
                currency=normalized_row["currency"],
                type=normalized_row["type"],
                account=normalized_row["from_account"],
                from_account=normalized_row["from_account"],
                to_account=normalized_row["to_account"],
                category=normalized_row["category"],
                subcategory=normalized_row["subcategory"],
                note=normalized_row["note"],
                source_file=source_file,
                last_seen_at=import_time,
                is_deleted=False,
            )
            self.session.add(transfer)
            return transfer, "inserted"

        # UPDATE existing transfer
        updateable_fields = [
            "category",
            "subcategory",
            "note",
            "type",
            "from_account",
            "to_account",
        ]
        return self._apply_existing_update(
            existing,
            transfer_id,
            import_time,
            updateable_fields,
            normalized_row,
            log_level="debug",
        )

    def mark_soft_deletes_transfers(self, import_time: datetime) -> int:
        """Mark transfers not seen in this import as deleted.

        Args:
            import_time: Import timestamp

        Returns:
            Number of transfers marked as deleted

        """
        user_id = self._ensure_user_id()

        stmt = (
            select(Transaction)
            .where(Transaction.user_id == user_id)
            .where(Transaction.type == TransactionType.TRANSFER)
            .where(Transaction.last_seen_at < import_time)
            .where(Transaction.is_deleted.is_(False))
        )

        stale_transfers = self.session.execute(stmt).scalars().all()

        count = 0
        for transfer in stale_transfers:
            transfer.is_deleted = True
            count += 1

        if count > 0:
            logger.info(f"Marked {count} transfers as deleted")

        return count

    def reconcile_transfers_batch(
        self,
        normalized_rows: list[dict[str, Any]],
        source_file: str,
        import_time: datetime,
    ) -> ReconciliationStats:
        """Reconcile a batch of transfers.

        Args:
            normalized_rows: List of normalized transfer data
            source_file: Source file name
            import_time: Import timestamp

        Returns:
            Reconciliation statistics

        Raises:
            ValueError: If user_id is not set in multi-user mode

        """
        self._ensure_user_id()

        stats = ReconciliationStats()
        seen_in_batch: set[str] = set()

        for row in normalized_rows:
            try:
                self._process_transfer_row(
                    row,
                    seen_in_batch,
                    stats,
                    source_file,
                    import_time,
                )
            except (ValueError, TypeError, KeyError) as e:
                logger.error("Error reconciling transfer: %s", e)
                continue

        # Commit all changes
        self.session.commit()

        # Mark soft deletes
        stats.deleted = self.mark_soft_deletes_transfers(import_time)
        self.session.commit()

        return stats
