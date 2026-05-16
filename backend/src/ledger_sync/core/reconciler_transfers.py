"""Transfer-specific reconciliation methods, used as a mixin on Reconciler.

Split out of the main reconciler.py file to keep both modules under 500 LOC.
The mixin relies on attributes/methods provided by the host Reconciler class.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import update

from ledger_sync.core.reconciler_helpers import (
    ReconciliationStats,
    log_batch_duplicate,
    update_stats_for_action,
)
from ledger_sync.db.models import Transaction, TransactionType
from ledger_sync.utils.logging import logger

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from ledger_sync.ingest.hash_id import TransactionHasher


class TransferReconcilerMixin:
    """Adds transfer-handling methods to the Reconciler class."""

    # Attributes/methods provided by the host class:
    session: Session
    user_id: int | None
    hasher: TransactionHasher

    def _ensure_user_id(self) -> int:  # noqa: D401, ANN101
        raise NotImplementedError

    def _batch_fetch_existing(self, record_ids: list[str], user_id: int) -> dict[str, Transaction]:
        raise NotImplementedError

    def _apply_existing_update(
        self,
        existing: Transaction,
        record_id: str,
        import_time: datetime,
        updateable_fields: list[str],
        normalized_row: dict[str, Any],
        log_level: str = "info",
    ) -> tuple[Transaction, str]:
        raise NotImplementedError

    def _find_existing_record(self, record_id: str, user_id: int) -> Transaction | None:
        raise NotImplementedError

    def reconcile_transfer(
        self,
        normalized_row: dict[str, Any],
        source_file: str,
        import_time: datetime,
        *,
        occurrence: int = 0,
    ) -> tuple[Transaction, str]:
        """Reconcile a single transfer (now stored as Transaction with type='Transfer').

        Args:
            normalized_row: Normalized transfer data
            source_file: Source file name
            import_time: Import timestamp
            occurrence: Zero-based index for hash disambiguation when multiple
                genuine transfers share the same (date, amount, from, to).

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
            occurrence=occurrence,
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
            update(Transaction)
            .where(Transaction.user_id == user_id)
            .where(Transaction.type == TransactionType.TRANSFER)
            .where(Transaction.last_seen_at < import_time)
            .where(Transaction.is_deleted.is_(False))
            .values(is_deleted=True)
            .execution_options(synchronize_session="fetch")
        )
        result = self.session.execute(stmt)
        count = int(result.rowcount)  # type: ignore[attr-defined]

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

        Uses batch-fetch to pre-load all existing records in one query,
        avoiding N+1 SELECT overhead on high-latency connections.

        Each real transfer appears TWICE in the source export (once as
        Transfer-In, once as Transfer-Out). Legs are counted per-direction
        so two genuinely-identical transfers on the same day (same amount
        between the same accounts) are NOT collapsed into one by dedup -
        the first In + first Out pair up (occurrence 0), the second In +
        second Out pair up (occurrence 1), and so on.

        Args:
            normalized_rows: List of normalized transfer data
            source_file: Source file name
            import_time: Import timestamp

        Returns:
            Reconciliation statistics

        Raises:
            ValueError: If user_id is not set in multi-user mode

        """
        user_id = self._ensure_user_id()

        stats = ReconciliationStats()

        # Phase 1: Pre-compute transfer IDs.
        # Per-leg-direction occurrence counters: first leg in each direction
        # for a given (canonical key) pairs with the first leg in the other
        # direction to form one transfer (occurrence 0). The second in each
        # direction form the second transfer (occurrence 1). And so on.
        legs_seen: dict[tuple[Any, ...], dict[str, int]] = defaultdict(
            lambda: {"in": 0, "out": 0},
        )
        seen_in_batch: set[str] = set()
        row_ids: list[str] = []
        skip_flags: list[bool] = []
        for row in normalized_rows:
            try:
                # Canonical key ignores leg direction: both In and Out rows
                # for the same real transfer produce the same key.
                canonical_key = (
                    row["date"],
                    row["amount"],
                    row["from_account"],
                    row["to_account"],
                    row.get("category"),
                    row.get("subcategory"),
                    row.get("note"),
                )
                leg = row.get("transfer_leg", "out")
                occurrence = legs_seen[canonical_key][leg]
                legs_seen[canonical_key][leg] += 1

                record_id = self.hasher.generate_transaction_id(
                    date=row["date"],
                    amount=row["amount"],
                    account=row["from_account"],
                    note=row["note"],
                    category=row["category"],
                    subcategory=row["subcategory"],
                    tx_type=row["type"],
                    user_id=user_id,
                    occurrence=occurrence,
                )
                if record_id in seen_in_batch:
                    # This row is the paired leg (same occurrence) of an
                    # earlier row we already kept. Safe to skip.
                    log_batch_duplicate(row, record_id, is_transfer=True)
                    row_ids.append(record_id)
                    skip_flags.append(True)
                else:
                    seen_in_batch.add(record_id)
                    row_ids.append(record_id)
                    skip_flags.append(False)
            except (ValueError, TypeError, KeyError) as e:
                logger.error("Error computing ID for transfer: %s", e)
                row_ids.append("")
                skip_flags.append(True)

        # Phase 2: Batch-fetch all existing records
        valid_ids = [rid for rid, skip in zip(row_ids, skip_flags) if rid and not skip]
        existing_map = self._batch_fetch_existing(valid_ids, user_id)

        # Phase 3: Process each row using pre-fetched data
        updateable_fields = [
            "category",
            "subcategory",
            "note",
            "type",
            "from_account",
            "to_account",
        ]
        for idx, row in enumerate(normalized_rows):
            tx_id = row_ids[idx]
            stats.processed += 1

            if skip_flags[idx] or not tx_id:
                stats.skipped += 1
                continue

            existing = existing_map.get(tx_id)

            if existing is None:
                transfer = Transaction(
                    transaction_id=tx_id,
                    user_id=user_id,
                    date=row["date"],
                    amount=row["amount"],
                    currency=row["currency"],
                    type=row["type"],
                    account=row["from_account"],
                    from_account=row["from_account"],
                    to_account=row["to_account"],
                    category=row["category"],
                    subcategory=row["subcategory"],
                    note=row["note"],
                    source_file=source_file,
                    last_seen_at=import_time,
                    is_deleted=False,
                )
                self.session.add(transfer)
                stats.inserted += 1
            else:
                _, action = self._apply_existing_update(
                    existing,
                    tx_id,
                    import_time,
                    updateable_fields,
                    row,
                    log_level="debug",
                )
                update_stats_for_action(stats, action)

        # Commit all changes
        self.session.commit()

        # Mark soft deletes
        stats.deleted = self.mark_soft_deletes_transfers(import_time)
        self.session.commit()

        return stats
