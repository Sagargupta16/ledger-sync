"""Transaction reconciliation logic."""

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.db.models import Transaction, TransactionType
from ledger_sync.ingest.hash_id import TransactionHasher
from ledger_sync.utils.logging import logger


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

            # Normalize for comparison
            # - None and empty string are treated as equal
            # - Enums are compared by their normalized values (case-insensitive)
            if field == "type":
                # Compare enum values case-insensitively
                new_val_str = (
                    new_value.value
                    if hasattr(new_value, "value")
                    else str(new_value) if new_value else None
                )
                old_val_str = (
                    old_value.value
                    if hasattr(old_value, "value")
                    else str(old_value) if old_value else None
                )
                values_equal = (new_val_str.upper() if new_val_str else None) == (
                    old_val_str.upper() if old_val_str else None
                )
            else:
                # For strings: treat None and "" as equal
                new_val_normalized = new_value if new_value else None
                old_val_normalized = old_value if old_value else None
                values_equal = new_val_normalized == old_val_normalized

            if not values_equal:
                changes_detected.append(f"{field}: {old_value!r} -> {new_value!r}")
                setattr(existing, field, new_value)
                changed = True

        return changed, changes_detected

    def reconcile_transaction(
        self,
        normalized_row: dict[str, Any],
        source_file: str,
        import_time: datetime,
    ) -> tuple[Transaction, str]:
        """Reconcile a single transaction.

        Args:
            normalized_row: Normalized transaction data
            source_file: Source file name
            import_time: Import timestamp

        Returns:
            Tuple of (Transaction, action) where action is "inserted", "updated", or "skipped"

        Raises:
            ValueError: If user_id is not set in multi-user mode

        """
        if self.user_id is None:
            raise ValueError("user_id is required for reconciliation")

        # Generate transaction ID - include user_id for uniqueness per user
        transaction_id = self.hasher.generate_transaction_id(
            date=normalized_row["date"],
            amount=normalized_row["amount"],
            account=normalized_row["account"],
            note=normalized_row["note"],
            category=normalized_row["category"],
            subcategory=normalized_row["subcategory"],
            tx_type=normalized_row["type"],
            user_id=self.user_id,
        )

        # Check if transaction exists for this user
        stmt = select(Transaction).where(
            Transaction.transaction_id == transaction_id,
            Transaction.user_id == self.user_id,
        )
        existing = self.session.execute(stmt).scalar_one_or_none()

        if existing is None:
            # INSERT new transaction
            transaction = Transaction(
                transaction_id=transaction_id,
                user_id=self.user_id,
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
        # Check if anything changed
        updateable_fields = ["category", "subcategory", "note", "type"]
        changed, changes_detected = self._detect_and_apply_changes(
            existing, normalized_row, updateable_fields
        )

        # Always update last_seen_at and is_deleted
        existing.last_seen_at = import_time
        if existing.is_deleted:
            existing.is_deleted = False
            changed = True

        if changed:
            if changes_detected:
                changes_str = ", ".join(changes_detected)
                logger.info(f"Transaction {transaction_id[:12]}... updated: {changes_str}")
            return existing, "updated"
        # Still update last_seen_at even if nothing else changed
        return existing, "skipped"

    def mark_soft_deletes(self, import_time: datetime) -> int:
        """Mark transactions not seen in this import as deleted.

        Note: Excludes transfers as they are handled separately by mark_soft_deletes_transfers.

        Args:
            import_time: Import timestamp

        Returns:
            Number of transactions marked as deleted

        """
        if self.user_id is None:
            raise ValueError("user_id is required for reconciliation")

        # Find transactions that weren't seen in this import (excluding transfers)
        # Filter by user
        stmt = (
            select(Transaction)
            .where(Transaction.user_id == self.user_id)
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
        if self.user_id is None:
            raise ValueError("user_id is required for reconciliation")

        stats = ReconciliationStats()
        seen_in_batch = set()  # Track transaction IDs seen in this batch

        for row in normalized_rows:
            try:
                # Generate transaction ID to check for duplicates in this batch
                transaction_id = self.hasher.generate_transaction_id(
                    date=row["date"],
                    amount=row["amount"],
                    account=row["account"],
                    note=row["note"],
                    category=row["category"],
                    subcategory=row["subcategory"],
                    tx_type=row["type"],
                    user_id=self.user_id,
                )

                # Skip duplicates within the same batch
                if transaction_id in seen_in_batch:
                    logger.warning(
                        f"Skipping duplicate transaction in batch: {transaction_id[:16]}... "
                        f"(Date: {row['date']}, Amount: {row['amount']}, "
                        f"Account: {row['account']}, Category: {row['category']}, "
                        f"Type: {row['type']})",
                    )
                    stats.processed += 1
                    stats.skipped += 1
                    continue

                seen_in_batch.add(transaction_id)

                _, action = self.reconcile_transaction(row, source_file, import_time)

                stats.processed += 1
                if action == "inserted":
                    stats.inserted += 1
                elif action == "updated":
                    stats.updated += 1
                elif action == "skipped":
                    stats.skipped += 1

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
        if self.user_id is None:
            raise ValueError("user_id is required for reconciliation")

        # Generate transfer ID (using from_account as account for hash)
        transfer_id = self.hasher.generate_transaction_id(
            date=normalized_row["date"],
            amount=normalized_row["amount"],
            account=normalized_row["from_account"],
            note=normalized_row["note"],
            category=normalized_row["category"],
            subcategory=normalized_row["subcategory"],
            tx_type=normalized_row["type"],
            user_id=self.user_id,
        )

        # Check if transfer exists in transactions table for this user
        stmt = select(Transaction).where(
            Transaction.transaction_id == transfer_id,
            Transaction.user_id == self.user_id,
        )
        existing = self.session.execute(stmt).scalar_one_or_none()

        if existing is None:
            # INSERT new transfer as Transaction
            transfer = Transaction(
                transaction_id=transfer_id,
                user_id=self.user_id,
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
        changed, changes_detected = self._detect_and_apply_changes(
            existing, normalized_row, updateable_fields
        )

        # Always update last_seen_at and is_deleted
        existing.last_seen_at = import_time
        if existing.is_deleted:
            existing.is_deleted = False
            changed = True

        if changed:
            if changes_detected:
                logger.debug(
                    f"Transfer {transfer_id[:12]}... updated: {', '.join(changes_detected)}"
                )
            return existing, "updated"
        return existing, "skipped"

    def mark_soft_deletes_transfers(self, import_time: datetime) -> int:
        """Mark transfers not seen in this import as deleted.

        Args:
            import_time: Import timestamp

        Returns:
            Number of transfers marked as deleted

        """
        if self.user_id is None:
            raise ValueError("user_id is required for reconciliation")

        stmt = (
            select(Transaction)
            .where(Transaction.user_id == self.user_id)
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
        if self.user_id is None:
            raise ValueError("user_id is required for reconciliation")

        stats = ReconciliationStats()
        seen_in_batch = set()

        for row in normalized_rows:
            try:
                # Generate transfer ID to check for duplicates
                transfer_id = self.hasher.generate_transaction_id(
                    date=row["date"],
                    amount=row["amount"],
                    account=row["from_account"],
                    note=row["note"],
                    category=row["category"],
                    subcategory=row["subcategory"],
                    tx_type=row["type"],
                    user_id=self.user_id,
                )

                # Skip duplicates within the same batch
                if transfer_id in seen_in_batch:
                    logger.warning(
                        f"Skipping duplicate transfer in batch: {transfer_id[:16]}... "
                        f"(Date: {row['date']}, Amount: {row['amount']}, "
                        f"From: {row['from_account']}, To: {row['to_account']})",
                    )
                    stats.processed += 1
                    stats.skipped += 1
                    continue

                seen_in_batch.add(transfer_id)

                _, action = self.reconcile_transfer(row, source_file, import_time)

                stats.processed += 1
                if action == "inserted":
                    stats.inserted += 1
                elif action == "updated":
                    stats.updated += 1
                elif action == "skipped":
                    stats.skipped += 1

            except (ValueError, TypeError, KeyError) as e:
                logger.error("Error reconciling transfer: %s", e)
                continue

        # Commit all changes
        self.session.commit()

        # Mark soft deletes
        stats.deleted = self.mark_soft_deletes_transfers(import_time)
        self.session.commit()

        return stats
