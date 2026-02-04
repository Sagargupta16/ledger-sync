"""Main synchronization engine."""

from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.core.analytics_engine import AnalyticsEngine
from ledger_sync.core.reconciler import Reconciler, ReconciliationStats
from ledger_sync.db.models import ImportLog
from ledger_sync.ingest.excel_loader import ExcelLoader
from ledger_sync.ingest.normalizer import DataNormalizer
from ledger_sync.utils.logging import logger


class SyncEngine:
    """Main synchronization engine orchestrating the import process."""

    def __init__(self, session: Session) -> None:
        """Initialize sync engine.

        Args:
            session: Database session

        """
        self.session = session
        self.loader = ExcelLoader()
        self.normalizer = DataNormalizer()
        self.reconciler = Reconciler(session)

    def check_already_imported(self, file_hash: str) -> ImportLog | None:
        """Check if file has already been imported.

        Args:
            file_hash: File hash to check

        Returns:
            ImportLog if file was previously imported, None otherwise

        """
        stmt = select(ImportLog).where(ImportLog.file_hash == file_hash)
        return self.session.execute(stmt).scalar_one_or_none()

    def import_file(self, file_path: Path, force: bool = False) -> ReconciliationStats:
        """Import Excel file and synchronize with database.

        Args:
            file_path: Path to Excel file
            force: Force import even if file was previously imported

        Returns:
            Reconciliation statistics

        Raises:
            ValueError: If file was already imported and force=False

        """
        logger.info(f"Starting import of {file_path}")
        import_time = datetime.now(UTC)

        # Step 1: Load and validate Excel
        df, column_mapping, file_hash = self.loader.load(file_path)

        # Check if already imported
        existing_import = self.check_already_imported(file_hash)
        if existing_import and not force:
            logger.info(f"File already imported at {existing_import.imported_at}")
            msg = (
                f"File already imported at {existing_import.imported_at}. "
                "Use --force to re-import."
            )
            raise ValueError(msg)

        # Step 2: Normalize data
        logger.info("Normalizing data...")
        normalized_rows = self.normalizer.normalize_dataframe(df, column_mapping)

        if not normalized_rows:
            logger.warning("No valid rows to import")
            return ReconciliationStats()

        # Separate transactions and transfers
        transactions = [row for row in normalized_rows if not row.get("is_transfer", False)]
        transfers = [row for row in normalized_rows if row.get("is_transfer", False)]

        logger.info(f"Found {len(transactions)} transactions and {len(transfers)} transfers")

        # Step 3: Reconcile transactions with database
        stats = ReconciliationStats()

        if transactions:
            logger.info("Reconciling transactions...")
            tx_stats = self.reconciler.reconcile_batch(
                normalized_rows=transactions,
                source_file=file_path.name,
                import_time=import_time,
            )
            stats.processed += tx_stats.processed
            stats.inserted += tx_stats.inserted
            stats.updated += tx_stats.updated
            stats.deleted += tx_stats.deleted
            stats.skipped += tx_stats.skipped

        # Step 4: Reconcile transfers with database
        if transfers:
            logger.info("Reconciling transfers...")
            tf_stats = self.reconciler.reconcile_transfers_batch(
                normalized_rows=transfers,
                source_file=file_path.name,
                import_time=import_time,
            )
            stats.processed += tf_stats.processed
            stats.inserted += tf_stats.inserted
            stats.updated += tf_stats.updated
            stats.deleted += tf_stats.deleted
            stats.skipped += tf_stats.skipped

        # Step 5: Log import
        # If this is a re-import, update existing log
        if existing_import and force:
            self.session.delete(existing_import)
            self.session.commit()

        import_log = ImportLog(
            file_hash=file_hash,
            file_name=file_path.name,
            imported_at=import_time,
            rows_processed=stats.processed,
            rows_inserted=stats.inserted,
            rows_updated=stats.updated,
            rows_deleted=stats.deleted,
            rows_skipped=stats.skipped,
        )

        self.session.add(import_log)
        self.session.commit()

        logger.info(f"Import completed: {stats}")

        # Step 6: Run analytics calculations
        logger.info("Running post-import analytics...")
        try:
            analytics_engine = AnalyticsEngine(self.session)
            analytics_results = analytics_engine.run_full_analytics(source_file=file_path.name)
            logger.info(f"Analytics completed: {analytics_results}")
        except (ValueError, TypeError, RuntimeError) as e:
            # Analytics failure shouldn't fail the import
            logger.error(f"Analytics calculation failed (non-fatal): {e}")

        return stats
