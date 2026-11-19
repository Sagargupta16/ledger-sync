"""Synchronous upload orchestration, executed as one worker-thread operation."""

from collections.abc import Callable
from typing import Literal

from sqlalchemy.orm import Session

from ledger_sync.core.analytics import AnalyticsEngine
from ledger_sync.core.analytics.refresh_budget import apply_refresh_budget
from ledger_sync.core.observability import report_exception
from ledger_sync.core.reconciler_helpers import ReconciliationStats
from ledger_sync.core.sync_engine import SnapshotOptions, SyncEngine
from ledger_sync.schemas.transactions import UploadResponse
from ledger_sync.schemas.upload import TransactionUploadRequest
from ledger_sync.services.idempotency import IdempotencyScope, run_once
from ledger_sync.utils.logging import logger

_INSIGHTS_FAILED = "Your ledger is saved. Insights could not be refreshed. Retry the refresh."


def process_upload(
    db: Session,
    user_id: int,
    payload: TransactionUploadRequest,
    *,
    on_ledger_saved: Callable[[UploadResponse], None] | None = None,
) -> UploadResponse:
    """Persist the snapshot, then refresh insights without undoing a saved import.

    Serialization, engine construction, database operations and rollback all
    stay in this worker. The caller captures user_id before any commit can
    expire the request's ORM user. ``on_ledger_saved`` receives the response
    as it stands before the refresh, inside the ledger's own transaction.
    """
    logger.info("Processing %d rows for user_id=%s", len(payload.rows), user_id)
    try:
        rows = [row.model_dump() for row in payload.rows]
        options = None
        if on_ledger_saved is not None:
            hook = on_ledger_saved

            def save_provisional(stats: ReconciliationStats) -> None:
                hook(_response(payload, stats, "failed"))

            options = SnapshotOptions(record_outcome=save_provisional)
        stats = SyncEngine(db, user_id=user_id).import_rows(
            rows=rows,
            file_name=payload.file_name,
            file_hash=payload.file_hash,
            force=payload.force,
            options=options,
        )
        return _response(payload, stats, _refresh_insights(db, user_id, payload.file_name))
    except Exception:
        db.rollback()
        raise


def process_upload_once(
    db: Session,
    user_id: int,
    payload: TransactionUploadRequest,
    scope: IdempotencyScope | None,
) -> tuple[UploadResponse, bool]:
    """``process_upload`` at most once per Idempotency-Key; True when replayed."""

    def resume(stored: UploadResponse) -> UploadResponse:
        status = _refresh_insights(db, user_id, stored.file_name)
        return stored.model_copy(
            update={"analytics_status": status, "analytics_message": _analytics_message(status)}
        )

    return run_once(
        db,
        scope,
        UploadResponse,
        lambda hook: process_upload(db, user_id, payload, on_ledger_saved=hook),
        resume,
    )


def _refresh_insights(db: Session, user_id: int, file_name: str) -> Literal["ready", "failed"]:
    """Refresh analytics after the commit; a failure leaves the saved ledger alone."""
    try:
        apply_refresh_budget(db)
        AnalyticsEngine(db, user_id=user_id).refresh_analytics(source_file=file_name)
    except Exception as exc:
        logger.warning(
            "Post-upload analytics failed for user_id=%s (%s)", user_id, type(exc).__name__
        )
        report_exception(exc)
        db.rollback()
        return "failed"
    return "ready"


def _analytics_message(status: Literal["ready", "failed"]) -> str | None:
    return _INSIGHTS_FAILED if status == "failed" else None


def _response(
    payload: TransactionUploadRequest,
    stats: ReconciliationStats,
    analytics_status: Literal["ready", "failed"],
) -> UploadResponse:
    return UploadResponse(
        success=True,
        message=f"Successfully processed {payload.file_name}",
        stats={
            "processed": stats.processed,
            "inserted": stats.inserted,
            "updated": stats.updated,
            "deleted": stats.deleted,
            "unchanged": stats.skipped,
        },
        file_name=payload.file_name,
        analytics_status=analytics_status,
        analytics_message=_analytics_message(analytics_status),
    )
