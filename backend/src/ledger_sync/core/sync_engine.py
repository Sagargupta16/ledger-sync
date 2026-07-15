"""Main synchronization engine."""

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.core import rules
from ledger_sync.core.analytics_engine import AnalyticsEngine
from ledger_sync.core.reconciler import Reconciler, ReconciliationStats
from ledger_sync.db.models import ImportLog, Transaction
from ledger_sync.ingest.csv_loader import CsvLoader
from ledger_sync.ingest.excel_loader import ExcelLoader
from ledger_sync.ingest.normalizer import DataNormalizer, NormalizationError
from ledger_sync.utils.logging import logger


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
        existing_import = self.check_already_imported(file_hash)
        if existing_import and not force:
            logger.info("File already imported at %s", existing_import.imported_at)
            msg = (
                f"File already imported at {existing_import.imported_at}. Use --force to re-import."
            )
            raise ValueError(msg)
        return existing_import

    def _canonicalize_account_casing(self, normalized_rows: list[dict[str, Any]]) -> None:
        """Fold case-variant account names onto one canonical spelling.

        "CC: Axis Google Flex" and "CC: AXIS Google Flex" are the same real
        account; letting both through creates two accounts everywhere
        downstream (balances, net worth, classifications). Canonical form is
        chosen per lowercased key: the spelling already stored in this user's
        transactions wins (so re-uploads converge on existing data), else the
        first spelling seen in this batch. Runs BEFORE hashing because the
        account name feeds the SHA-256 transaction_id.

        Transfer rows keep ``category`` in sync ("Transfer: A → B" embeds the
        account names) so the displayed label matches the folded accounts.
        """
        # Seed with existing spellings from the user's ledger (all three legs).
        canonical: dict[str, str] = {}
        if self.user_id is not None:
            for column in (Transaction.account, Transaction.from_account, Transaction.to_account):
                stmt = (
                    select(column)
                    .where(Transaction.user_id == self.user_id, column.is_not(None))
                    .distinct()
                )
                for (name,) in self.session.execute(stmt):
                    canonical.setdefault(name.lower(), name)

        def fold(name: str | None) -> str | None:
            if not name:
                return name
            return canonical.setdefault(name.lower(), name)

        for row in normalized_rows:
            row["account"] = fold(row.get("account"))
            if row.get("is_transfer", False):
                row["from_account"] = fold(row.get("from_account"))
                row["to_account"] = fold(row.get("to_account"))
                row["category"] = f"Transfer: {row['from_account']} → {row['to_account']}"

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
        # Apply the user's categorization rules BEFORE any hashing: category
        # and subcategory feed the SHA-256 transaction_id, so mutating rows
        # here keeps re-uploads deterministic (same raw row + same rules =
        # same hash = dedup skip). apply_rules_to_row skips transfer rows.
        if self.user_id is not None:
            active_rules = rules.load_active_rules(self.session, self.user_id)
            if active_rules:
                for row in normalized_rows:
                    rules.apply_rules_to_row(active_rules, row)

        self._canonicalize_account_casing(normalized_rows)

        transactions = [r for r in normalized_rows if not r.get("is_transfer", False)]
        transfers = [r for r in normalized_rows if r.get("is_transfer", False)]
        logger.info("Found %d transactions and %d transfers", len(transactions), len(transfers))

        stats = ReconciliationStats()

        if transactions:
            stats.merge(
                self.reconciler.reconcile_batch(
                    normalized_rows=transactions,
                    source_file=source_file,
                    import_time=import_time,
                )
            )

        if transfers:
            stats.merge(
                self.reconciler.reconcile_transfers_batch(
                    normalized_rows=transfers,
                    source_file=source_file,
                    import_time=import_time,
                )
            )

        # On a forced re-import, drop the prior log before writing the new one.
        if existing_import:
            self.session.delete(existing_import)
            self.session.commit()

        import_log = ImportLog(
            user_id=self.user_id,
            file_hash=file_hash,
            file_name=source_file,
            imported_at=import_time,
            rows_processed=stats.processed,
            rows_inserted=stats.inserted,
            rows_updated=stats.updated,
            rows_deleted=stats.deleted,
            rows_skipped=stats.skipped,
        )
        self.session.add(import_log)
        self.session.commit()

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
        rows. This method normalizes (category corrections, transfer resolution),
        hashes, reconciles, and runs post-import analytics.

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
        import_time = datetime.now(UTC)

        existing_import = self._raise_if_already_imported(file_hash, force=force)

        # Normalize each row (category corrections, transfer resolution, etc.)
        normalized_rows: list[dict[str, Any]] = []
        for idx, row in enumerate(rows):
            try:
                normalized = self.normalizer.normalize_from_dict(row)
                normalized_rows.append(normalized)
            except NormalizationError as e:
                logger.warning("Row %d: %s", idx + 2, e)

        if not normalized_rows:
            logger.warning("No valid rows to import")
            return ReconciliationStats()

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
            analytics_results = analytics_engine.run_full_analytics(source_file=source_file)
            logger.info("Analytics completed: %s", analytics_results)
        except (ValueError, TypeError, RuntimeError) as e:
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
        import_time = datetime.now(UTC)

        # Step 1: Load and validate — pick the right loader by extension
        if file_path.suffix.lower() == ".csv":
            df, column_mapping, file_hash = self.csv_loader.load(file_path)
        else:
            df, column_mapping, file_hash = self.excel_loader.load(file_path)

        existing_import = self._raise_if_already_imported(file_hash, force=force)

        # Step 2: Normalize data
        logger.info("Normalizing data...")
        normalized_rows = self.normalizer.normalize_dataframe(df, column_mapping)

        if not normalized_rows:
            logger.warning("No valid rows to import")
            return ReconciliationStats()

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
