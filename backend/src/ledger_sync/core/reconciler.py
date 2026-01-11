"""Transaction reconciliation logic."""

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.db.models import Transaction, Transfer
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
        """String representation."""
        return (
            f"ReconciliationStats(processed={self.processed}, "
            f"inserted={self.inserted}, updated={self.updated}, "
            f"deleted={self.deleted}, skipped={self.skipped})"
        )


class Reconciler:
    """Reconciles Excel data with database."""

    def __init__(self, session: Session) -> None:
        """Initialize reconciler.

        Args:
            session: Database session
        """
        self.session = session
        self.hasher = TransactionHasher()

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
        """
        # Generate transaction ID
        transaction_id = self.hasher.generate_transaction_id(
            date=normalized_row["date"],
            amount=normalized_row["amount"],
            account=normalized_row["account"],
            note=normalized_row["note"],
            category=normalized_row["category"],
            subcategory=normalized_row["subcategory"],
            tx_type=normalized_row["type"],
        )

        # Check if transaction exists
        stmt = select(Transaction).where(Transaction.transaction_id == transaction_id)
        existing = self.session.execute(stmt).scalar_one_or_none()

        if existing is None:
            # INSERT new transaction
            transaction = Transaction(
                transaction_id=transaction_id,
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

        else:
            # UPDATE existing transaction
            # Check if anything changed
            changed = False

            updateable_fields = ["category", "subcategory", "note", "type"]
            for field in updateable_fields:
                new_value = normalized_row[field]
                old_value = getattr(existing, field)

                if new_value != old_value:
                    setattr(existing, field, new_value)
                    changed = True

            # Always update last_seen_at and is_deleted
            existing.last_seen_at = import_time
            if existing.is_deleted:
                existing.is_deleted = False
                changed = True

            if changed:
                return existing, "updated"
            else:
                # Still update last_seen_at even if nothing else changed
                return existing, "skipped"

    def mark_soft_deletes(self, import_time: datetime) -> int:
        """Mark transactions not seen in this import as deleted.

        Args:
            import_time: Import timestamp

        Returns:
            Number of transactions marked as deleted
        """
        # Find transactions that weren't seen in this import
        stmt = (
            select(Transaction)
            .where(Transaction.last_seen_at < import_time)
            .where(Transaction.is_deleted == False)  # noqa: E712
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
        """
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
                )

                # Skip duplicates within the same batch
                if transaction_id in seen_in_batch:
                    logger.warning(
                        f"Skipping duplicate transaction in batch: {transaction_id[:16]}... "
                        f"(Date: {row['date']}, Amount: {row['amount']}, "
                        f"Account: {row['account']}, Category: {row['category']}, "
                        f"Type: {row['type']})"
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

            except Exception as e:
                logger.error(f"Error reconciling transaction: {e}")
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
    ) -> tuple[Transfer, str]:
        """Reconcile a single transfer.

        Args:
            normalized_row: Normalized transfer data
            source_file: Source file name
            import_time: Import timestamp

        Returns:
            Tuple of (Transfer, action) where action is "inserted", "updated", or "skipped"
        """
        # Generate transfer ID
        transfer_id = self.hasher.generate_transaction_id(
            date=normalized_row["date"],
            amount=normalized_row["amount"],
            account=normalized_row["from_account"],
            note=normalized_row["note"],
            category=normalized_row["category"],
            subcategory=normalized_row["subcategory"],
            tx_type=normalized_row["type"],
        )

        # Check if transfer exists
        stmt = select(Transfer).where(Transfer.transfer_id == transfer_id)
        existing = self.session.execute(stmt).scalar_one_or_none()

        if existing is None:
            # INSERT new transfer
            transfer = Transfer(
                transfer_id=transfer_id,
                date=normalized_row["date"],
                amount=normalized_row["amount"],
                currency=normalized_row["currency"],
                type=normalized_row["type"],
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

        else:
            # UPDATE existing transfer
            changed = False

            updateable_fields = [
                "category",
                "subcategory",
                "note",
                "type",
                "from_account",
                "to_account",
            ]
            for field in updateable_fields:
                new_value = normalized_row[field]
                old_value = getattr(existing, field)

                if new_value != old_value:
                    setattr(existing, field, new_value)
                    changed = True

            # Always update last_seen_at and is_deleted
            existing.last_seen_at = import_time
            if existing.is_deleted:
                existing.is_deleted = False
                changed = True

            if changed:
                return existing, "updated"
            else:
                return existing, "skipped"

    def mark_soft_deletes_transfers(self, import_time: datetime) -> int:
        """Mark transfers not seen in this import as deleted.

        Args:
            import_time: Import timestamp

        Returns:
            Number of transfers marked as deleted
        """
        stmt = (
            select(Transfer)
            .where(Transfer.last_seen_at < import_time)
            .where(Transfer.is_deleted == False)  # noqa: E712
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
        """
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
                )

                # Skip duplicates within the same batch
                if transfer_id in seen_in_batch:
                    logger.warning(
                        f"Skipping duplicate transfer in batch: {transfer_id[:16]}... "
                        f"(Date: {row['date']}, Amount: {row['amount']}, "
                        f"From: {row['from_account']}, To: {row['to_account']})"
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

            except Exception as e:
                logger.error(f"Error reconciling transfer: {e}")
                continue

        # Commit all changes
        self.session.commit()

        # Mark soft deletes
        stats.deleted = self.mark_soft_deletes_transfers(import_time)
        self.session.commit()

        return stats
