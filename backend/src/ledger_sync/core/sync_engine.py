"""Main synchronization engine."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ledger_sync.core import rules
from ledger_sync.core.analytics.refresh import lock_analytics_user, mark_ledger_changed
from ledger_sync.core.analytics_engine import AnalyticsEngine
from ledger_sync.core.import_identity import capture_source_identities
from ledger_sync.core.import_labels import canonicalize_accounts, canonicalize_categories
from ledger_sync.core.reconciler import Reconciler, ReconciliationStats
from ledger_sync.core.source_identity import SOURCE_FIELDS
from ledger_sync.db.models import ImportLog, Transaction
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


class LargeDeletionError(ValueError):
    """Raised, before anything commits, when a snapshot would remove too much."""

    def __init__(self, deleted: int, live: int) -> None:
        super().__init__(
            f"This backup would remove {deleted:,} of your {live:,} transactions. Nothing was "
            "changed. Upload it from the Upload page to review the removals first."
        )
        self.deleted = deleted
        self.live = live


# A guarded snapshot may soft-delete at most this many rows, or 5% of the live
# ledger when that is larger, without an explicit confirmation.
_GUARD_MIN_DELETIONS = 25
_GUARD_SHARE = 0.05


@dataclass(frozen=True, slots=True)
class SnapshotOptions:
    """How a snapshot import commits.

    ``dry_run`` reconciles and reports, then rolls back. ``guard_deletions``
    refuses a snapshot that would remove more than the allowance below.
    ``before_commit`` adds writes (such as account settings) to the same unit.
    """

    dry_run: bool = False
    guard_deletions: bool = False
    before_commit: Callable[[], None] | None = None


def _deletion_allowance(live: int) -> int:
    return max(_GUARD_MIN_DELETIONS, int(live * _GUARD_SHARE))


def _describe_row(index: int, row: dict[str, Any]) -> str:
    """Spreadsheet rows are named by line; backup rows by their date and account."""
    if row.get("_source_uid"):
        return f"The {row.get('date')} transaction on {row.get('account')}"
    return f"Row {index + 2}"


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

    def _live_count(self) -> int:
        return (
            self.session.scalar(
                select(func.count())
                .select_from(Transaction)
                .where(Transaction.user_id == self.user_id, Transaction.is_deleted.is_(False))
            )
            or 0
        )

    def _reconcile_and_log(
        self,
        normalized_rows: list[dict[str, Any]],
        *,
        source_file: str,
        file_hash: str,
        import_time: datetime,
        existing_import: ImportLog | None,
        options: SnapshotOptions | None = None,
    ) -> ReconciliationStats:
        """Reconcile normalized rows (transactions + transfers) and record the import log.

        Shared tail of both import paths: splits rows by transfer flag,
        reconciles each batch, accumulates stats, and writes the ImportLog.
        A dry run or a guarded snapshot that removes too much rolls back instead.
        """
        options = options or SnapshotOptions()
        user_id = self._prepare_rows(normalized_rows)

        transactions = [r for r in normalized_rows if not r.get("is_transfer", False)]
        transfers = [r for r in normalized_rows if r.get("is_transfer", False)]
        logger.info("Found %d transactions and %d transfers", len(transactions), len(transfers))

        stats = ReconciliationStats()
        self.reconciler.affected_dates.clear()

        try:
            live_before = self._live_count() if options.guard_deletions else 0
            attach_ledger_dimensions(self.session, user_id, normalized_rows)
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

            if options.guard_deletions and stats.deleted > _deletion_allowance(live_before):
                raise LargeDeletionError(stats.deleted, live_before)
            if options.dry_run:
                self.session.rollback()
                return stats
            if options.before_commit is not None:
                options.before_commit()

            # The prior log, both ledger groups, and the replacement log are
            # committed as one unit, including empty-group soft deletions.
            self._record_import(
                existing_import, user_id, file_hash, source_file, import_time, stats
            )
            if stats.inserted or stats.updated or stats.deleted:
                mark_ledger_changed(self.session, user_id, self.reconciler.affected_dates)
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise

        logger.info("Import completed: %s", stats)
        return stats

    def _prepare_rows(self, normalized_rows: list[dict[str, Any]]) -> int:
        """Canonicalize labels, capture source identity, apply rules, validate; return the user."""
        # Source identity precedes mutable user categorization. Existing public
        # IDs remain stable when rules or classifications change.
        self._canonicalize_account_casing(normalized_rows)
        self._canonicalize_category_casing(normalized_rows)
        if self.user_id is None:
            raise ValueError("user_id is required for imports")
        capture_source_identities(normalized_rows, self.user_id)
        active_rules = rules.load_active_rules(self.session, self.user_id)
        if active_rules:
            for row in normalized_rows:
                rules.apply_rules_to_row(active_rules, row)
        self._canonicalize_category_casing(normalized_rows)
        for row in normalized_rows:
            self.normalizer.validate_normalized_row(row)
        return self.user_id

    def _record_import(
        self,
        existing_import: ImportLog | None,
        user_id: int,
        file_hash: str,
        source_file: str,
        import_time: datetime,
        stats: ReconciliationStats,
    ) -> None:
        """Write this import's counts, reusing the unique log row on a forced re-import.

        Inserting a replacement before a pending DELETE would violate its unique key.
        """
        import_log = existing_import or ImportLog(user_id=user_id, file_hash=file_hash)
        import_log.file_name = source_file
        import_log.imported_at = import_time
        import_log.rows_processed = stats.processed
        import_log.rows_inserted = stats.inserted
        import_log.rows_updated = stats.updated
        import_log.rows_deleted = stats.deleted
        import_log.rows_skipped = stats.skipped
        self.session.add(import_log)

    def import_rows(
        self,
        rows: list[dict[str, Any]],
        file_name: str,
        file_hash: str,
        force: bool = False,
        options: SnapshotOptions | None = None,
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
            options: Dry run, deletion guard and extra writes; see SnapshotOptions.

        Rows from a source with stable IDs may also carry the ``SOURCE_FIELDS``
        keys; they survive normalization and identify the stored row.

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
            except NormalizationError as e:
                msg = (
                    f"{_describe_row(idx, row)}: {e}. Snapshot rejected; "
                    "no ledger entries were changed."
                )
                raise NormalizationError(msg) from e
            normalized.update({key: row[key] for key in SOURCE_FIELDS if key in row})
            normalized_rows.append(normalized)

        existing_import = self._raise_if_already_imported(file_hash, force=force)
        import_time = datetime.now(UTC)

        return self._reconcile_and_log(
            normalized_rows,
            source_file=file_name,
            file_hash=file_hash,
            import_time=import_time,
            existing_import=existing_import,
            options=options,
        )

    def run_post_import_analytics(self, source_file: str) -> None:
        """Run analytics after import. Safe to call separately or in background.

        Args:
            source_file: Source file name for analytics context.

        """
        logger.info("Running post-import analytics...")
        try:
            if self.user_id is None:
                raise ValueError("user_id is required for analytics")
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
