"""Import a Money Manager backup as a complete ledger snapshot, in one worker phase.

The backup replaces the ledger like a spreadsheet export does, with three
differences: rows keep their Money Manager UIDs (so edits update rows in
place), account settings the export leaves out are stored, and a repeat of
the same backup is reported as unchanged instead of refused.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from sqlalchemy import bindparam, select, update
from sqlalchemy.orm import Session

from ledger_sync.core.analytics import AnalyticsEngine
from ledger_sync.core.analytics.refresh import mark_preferences_changed
from ledger_sync.core.reconciler_helpers import ReconciliationStats
from ledger_sync.core.sync_engine import SnapshotOptions, SyncEngine
from ledger_sync.db.models import LEDGER_ACCOUNTS, AccountType, LedgerAccount
from ledger_sync.ingest.money_manager import BackupAccount, MoneyManagerBackup, read_backup
from ledger_sync.ingest.normalizer import DataNormalizer
from ledger_sync.schemas.money_manager import BackupSummary, MoneyManagerUploadResponse
from ledger_sync.schemas.upload import MAX_LABEL_LENGTH
from ledger_sync.services.ledger_dimensions import ensure_account_ids
from ledger_sync.utils.logging import logger

DEFAULT_FILE_NAME = "Money Manager backup"

# Money Manager's default account groups and the type each one implies. Only an
# account with no type yet takes it; a type the user chose is never replaced.
_GROUP_TYPES = {
    "cash": AccountType.CASH,
    "bank accounts": AccountType.BANK_ACCOUNTS,
    "credit cards": AccountType.CREDIT_CARDS,
    "investments": AccountType.INVESTMENTS,
    "loans": AccountType.LOANS,
    "digital wallets": AccountType.OTHER_WALLETS,
}


@dataclass(frozen=True, slots=True)
class BackupUpload:
    """One upload request. ``allow_large_delete`` is the user's reviewed confirmation."""

    file_name: str = DEFAULT_FILE_NAME
    dry_run: bool = False
    force: bool = False
    allow_large_delete: bool = False


def import_money_manager_backup(
    db: Session, user_id: int, body: bytes, upload: BackupUpload
) -> MoneyManagerUploadResponse:
    """Read, reconcile and commit a backup, then refresh insights without undoing it."""
    backup = read_backup(body)
    summary = _summary(backup)
    engine = SyncEngine(db, user_id=user_id)
    if not upload.force and engine.check_already_imported(backup.database_hash) is not None:
        return _response("unchanged", upload, _unchanged(backup), summary, "skipped")
    options = SnapshotOptions(
        dry_run=upload.dry_run,
        guard_deletions=not upload.dry_run and not upload.allow_large_delete,
        before_commit=lambda: apply_account_settings(db, user_id, backup.accounts),
    )
    try:
        # The repeat check above stands in for the engine's own refusal.
        stats = engine.import_rows(
            backup.rows, upload.file_name, backup.database_hash, force=True, options=options
        )
    except Exception:
        db.rollback()
        raise
    if upload.dry_run:
        return _response("preview", upload, stats, summary, "skipped")
    analytics_status: Literal["ready", "failed"] = "ready"
    try:
        AnalyticsEngine(db, user_id=user_id).refresh_analytics(source_file=upload.file_name)
    except Exception as exc:
        logger.warning(
            "Post-backup analytics failed for user_id=%s (%s)", user_id, type(exc).__name__
        )
        db.rollback()
        analytics_status = "failed"
    return _response("imported", upload, stats, summary, analytics_status)


def apply_account_settings(db: Session, user_id: int, accounts: list[BackupAccount]) -> None:
    """Store each live account's group, card days and paying account."""
    normalizer = DataNormalizer()
    labels = {account.uid: normalizer.account_label(account.name) for account in accounts}
    labels = {uid: label for uid, label in labels.items() if 0 < len(label) <= MAX_LABEL_LENGTH}
    if not labels:
        return
    ids = ensure_account_ids(db, user_id, list(labels.values()))
    records = {
        record.id: record
        for record in db.scalars(
            select(LedgerAccount).where(
                LedgerAccount.user_id == user_id, LedgerAccount.id.in_(set(ids.values()))
            )
        )
    }
    typed = False
    settings: list[dict[str, object]] = []
    for account in accounts:
        label = labels.get(account.uid)
        if label is None:
            continue
        record = records[ids[label]]
        paid_from = labels.get(account.paid_from_uid or "")
        settings.append(
            {
                "s_id": record.id,
                "s_source_uid": account.uid,
                "s_account_group": account.group,
                "s_statement_day": account.statement_day,
                "s_payment_day": account.payment_day,
                "s_paid_from_account_id": ids[paid_from] if paid_from else None,
            }
        )
        implied = _GROUP_TYPES.get((account.group or "").lower())
        if record.account_type is None and implied is not None:
            record.account_type = implied
            typed = True
    _write_settings(db, user_id, settings)
    if typed:
        mark_preferences_changed(db, user_id)


def _write_settings(db: Session, user_id: int, settings: list[dict[str, object]]) -> None:
    """One Core UPDATE for every account; these columns are table-only for the expand phase."""
    if not settings:
        return
    columns = (
        "source_uid",
        "account_group",
        "statement_day",
        "payment_day",
        "paid_from_account_id",
    )
    stmt = (
        update(LEDGER_ACCOUNTS)
        .where(LEDGER_ACCOUNTS.c.user_id == user_id, LEDGER_ACCOUNTS.c.id == bindparam("s_id"))
        .values({column: bindparam(f"s_{column}") for column in columns})
    )
    db.execute(stmt.execution_options(synchronize_session=False), settings)


def _summary(backup: MoneyManagerBackup) -> BackupSummary:
    dates = sorted(str(row["date"]) for row in backup.rows if row.get("date"))
    return BackupSummary(
        transactions=backup.transactions,
        transfers=backup.transfers,
        accounts=len(backup.accounts),
        first_date=dates[0] if dates else None,
        last_date=dates[-1] if dates else None,
    )


def _unchanged(backup: MoneyManagerBackup) -> ReconciliationStats:
    stats = ReconciliationStats()
    stats.processed = len(backup.rows)
    stats.skipped = len(backup.rows)
    return stats


def _response(
    status: Literal["imported", "unchanged", "preview"],
    upload: BackupUpload,
    stats: ReconciliationStats,
    summary: BackupSummary,
    analytics_status: Literal["ready", "failed", "skipped"],
) -> MoneyManagerUploadResponse:
    return MoneyManagerUploadResponse(
        status=status,
        file_name=upload.file_name,
        stats={
            "processed": stats.processed,
            "inserted": stats.inserted,
            "updated": stats.updated,
            "deleted": stats.deleted,
            "unchanged": stats.skipped,
        },
        summary=summary,
        analytics_status=analytics_status,
        analytics_message=(
            "Your ledger is saved. Insights could not be refreshed. Retry the refresh."
            if analytics_status == "failed"
            else None
        ),
    )
