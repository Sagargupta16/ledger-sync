"""Main synchronization engine."""

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.core import rules
from ledger_sync.core.analytics.refresh import lock_analytics_user, mark_ledger_changed
from ledger_sync.core.analytics_engine import AnalyticsEngine
from ledger_sync.core.import_identity import capture_source_identities
from ledger_sync.core.import_labels import canonicalize_accounts, canonicalize_categories
from ledger_sync.core.reconciler import Reconciler, ReconciliationStats
from ledger_sync.db.models import ImportLog
from ledger_sync.ingest.csv_loader import CsvLoader
from ledger_sync.ingest.excel_loader import ExcelLoader
from ledger_sync.ingest.normalizer import (
    DataNormalizer,
    NormalizationError,
)
from ledger_sync.schemas.upload import MAX_UPLOAD_ROWS
from ledger_sync.services.ledger_dimensions import attach_ledger_dimensions
from ledger_sync.utils.logging import logger


class AlreadyImportedError(ValueError):
    """Raised when the same file requires an explicit forced re-import."""


class SyncEngine:
    """Main synchronization engine orchestrating the import process."""

    def __init__(self, session: Session, user_id: int | None = None) -> None:
        """Initialize sync engine.

        Args:
            session: Database session
            user_id: ID of the authenticated user (required for multi-user mode)

        """
        self.session = session
        self.user_id = user_id
        self.excel_loader = ExcelLoader()
        self.csv_loader = CsvLoader()
        self.normalizer = DataNormalizer()
        self.reconciler = Reconciler(session, user_id=user_id)

    def check_already_imported(self, file_hash: str) -> ImportLog | None:
        """Check if file has already been imported by this user.

        Args:
            file_hash: File hash to check

        Returns:
            ImportLog if file was previously imported by this user, None otherwise

        """
        stmt = select(ImportLog).where(
            ImportLog.file_hash == file_hash, ImportLog.user_id == self.user_id
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def _raise_if_already_imported(self, file_hash: str, *, force: bool) -> ImportLog | None:
        """Return any existing import log, raising if it blocks a non-forced re-import."""
        # Serialize replacement snapshots for one user on PostgreSQL. The lock
        # lasts until the ledger and log commit together.
        if self.user_id is None:
            raise ValueError("user_id is required for imports")
        lock_analytics_user(self.session, self.user_id)
        existing_import = self.check_already_imported(file_hash)
        if existing_import and not force:
            logger.info("File already imported at %s", existing_import.imported_at)
            msg = (
                f"File already imported at {existing_import.imported_at}. Use --force to re-import."
            )
            raise AlreadyImportedError(msg)
        return existing_import

    def _canonicalize_account_casing(self, normalized_rows: list[dict[str, Any]]) -> None:
        if self.user_id is not None:
            canonicalize_accounts(self.session, self.user_id, normalized_rows)

    def _canonicalize_category_casing(self, normalized_rows: list[dict[str, Any]]) -> None:
        if self.user_id is not None:
            canonicalize_categories(self.session, self.user_id, normalized_rows)

    def _reconcile_and_log(
        self,
        normalized_rows: list[dict[str, Any]],
        *,
        source_file: str,
        file_hash: str,
        import_time: datetime,
        existing_import: ImportLog | None,
    ) -> ReconciliationStats:
        """Reconcile normalized rows (transactions + transfers) and record the import log.

        Shared tail of both import paths: splits rows by transfer flag,
        reconciles each batch, accumulates stats, and writes the ImportLog.
        """
        # Source identity precedes mutable user categorization. Existing public
        # IDs remain stable when rules or classifications change.
        self._canonicalize_account_casing(normalized_rows)
        self._canonicalize_category_casing(normalized_rows)
        if self.user_id is None:
            raise ValueError("user_id is required for imports")
        capture_source_identities(normalized_rows, self.user_id)
        if self.user_id is not None:
            active_rules = rules.load_active_rules(self.session, self.user_id)
            if active_rules:
                for row in normalized_rows:
                    rules.apply_rules_to_row(active_rules, row)

        self._canonicalize_category_casing(normalized_rows)
        for row in normalized_rows:
            self.normalizer.validate_normalized_row(row)

        transactions = [r for r in normalized_rows if not r.get("is_transfer", False)]
        transfers = [r for r in normalized_rows if r.get("is_transfer", False)]
        logger.info("Found %d transactions and %d transfers", len(transactions), len(transfers))

        stats = ReconciliationStats()
        self.reconciler.affected_dates.clear()

        try:
            attach_ledger_dimensions(self.session, self.user_id, normalized_rows)
            stats.merge(
                self.reconciler.reconcile_batch(
                    normalized_rows=transactions,
                    source_file=source_file,
                    import_time=import_time,
                )
            )

            stats.merge(
                self.reconciler.reconcile_transfers_batch(
                    normalized_rows=transfers,
                    source_file=source_file,
                    import_time=import_time,
                )
            )

            # The prior log, both ledger groups, and the replacement log are
            # committed as one unit, including empty-group soft deletions.
            # Reuse the unique import identity on forced imports. Inserting a
            # replacement before a pending DELETE would violate its unique key.
            import_log = existing_import or ImportLog(user_id=self.user_id, file_hash=file_hash)
            import_log.file_name = source_file
            import_log.imported_at = import_time
            import_log.rows_processed = stats.processed
            import_log.rows_inserted = stats.inserted
            import_log.rows_updated = stats.updated
            import_log.rows_deleted = stats.deleted
            import_log.rows_skipped = stats.skipped
            self.session.add(import_log)
            if stats.inserted or stats.updated or stats.deleted:
                mark_ledger_changed(self.session, self.user_id, self.reconciler.affected_dates)
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise

        logger.info("Import completed: %s", stats)
        return stats

    def import_rows(
        self,
        rows: list[dict[str, Any]],
        file_name: str,
        file_hash: str,
        force: bool = False,
    ) -> ReconciliationStats:
        """Import pre-parsed transaction rows from the JSON upload endpoint.

        The frontend has already parsed the Excel/CSV file and sent structured
        rows. This method validates the full snapshot, normalizes labels,
        reconciles both ledger groups, and commits them with the import log.
        Entries absent from the snapshot are soft-deleted across all dates and
        accounts. Analytics runs separately after that commit.

        Args:
            rows: List of dicts with keys: date, amount, currency, type,
                  account, category, subcategory, note.
            file_name: Original file name (for import log).
            file_hash: SHA-256 hex hash of the original file (for dedup).
            force: Force re-import even if file was previously imported.

        Returns:
            Reconciliation statistics.

        Raises:
            ValueError: If file was already imported and force=False.

        """
        logger.info("Starting JSON import of %s (%d rows)", file_name, len(rows))
        if not rows or len(rows) > MAX_UPLOAD_ROWS:
            msg = f"Snapshot must contain between 1 and {MAX_UPLOAD_ROWS:,} rows"
            raise NormalizationError(msg)

        # Normalize each row (category corrections, transfer resolution, etc.)
        normalized_rows: list[dict[str, Any]] = []
        for idx, row in enumerate(rows):
            try:
                normalized = self.normalizer.normalize_from_dict(row)
                normalized_rows.append(normalized)
            except NormalizationError as e:
                msg = f"Row {idx + 2}: {e}. Snapshot rejected; no ledger entries were changed."
                raise NormalizationError(msg) from e

        existing_import = self._raise_if_already_imported(file_hash, force=force)
        import_time = datetime.now(UTC)

        return self._reconcile_and_log(
            normalized_rows,
            source_file=file_name,
            file_hash=file_hash,
            import_time=import_time,
            existing_import=existing_import,
        )

    def run_post_import_analytics(self, source_file: str) -> None:
        """Run analytics after import. Safe to call separately or in background.

        Args:
            source_file: Source file name for analytics context.

        """
        logger.info("Running post-import analytics...")
        try:
            analytics_engine = AnalyticsEngine(self.session, user_id=self.user_id)
            analytics_results = analytics_engine.refresh_analytics(source_file=source_file)
            logger.info("Analytics completed: %s", analytics_results)
        except Exception as e:
            self.session.rollback()
            logger.error("Analytics calculation failed (non-fatal): %s", e)

    def import_file(self, file_path: Path, force: bool = False) -> ReconciliationStats:
        """Import an Excel or CSV file and synchronize with database.

        Args:
            file_path: Path to Excel (.xlsx, .xls) or CSV (.csv) file
            force: Force import even if file was previously imported

        Returns:
            Reconciliation statistics

        Raises:
            ValueError: If file was already imported and force=False

        """
        logger.info(f"Starting import of {file_path}")

        # Step 1: Load and validate -- pick the right loader by extension
        if file_path.suffix.lower() == ".csv":
            df, column_mapping, file_hash = self.csv_loader.load(file_path)
        else:
            df, column_mapping, file_hash = self.excel_loader.load(file_path)

        # Step 2: Normalize data
        logger.info("Normalizing data...")
        normalized_rows = self.normalizer.normalize_dataframe(df, column_mapping)

        existing_import = self._raise_if_already_imported(file_hash, force=force)
        import_time = datetime.now(UTC)

        # Steps 3-5: Reconcile transactions + transfers and write the import log.
        stats = self._reconcile_and_log(
            normalized_rows,
            source_file=file_path.name,
            file_hash=file_hash,
            import_time=import_time,
            existing_import=existing_import,
        )

        # Step 6: Run analytics calculations (inline for CLI)
        self.run_post_import_analytics(file_path.name)

        return stats
