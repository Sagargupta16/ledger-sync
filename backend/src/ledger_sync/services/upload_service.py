"""Synchronous upload orchestration, executed as one worker-thread operation."""

from typing import Literal

from sqlalchemy.orm import Session

from ledger_sync.core.analytics import AnalyticsEngine
from ledger_sync.core.sync_engine import SyncEngine
from ledger_sync.schemas.transactions import UploadResponse
from ledger_sync.schemas.upload import TransactionUploadRequest
from ledger_sync.utils.logging import logger


def process_upload(db: Session, user_id: int, payload: TransactionUploadRequest) -> UploadResponse:
    """Persist the snapshot, then refresh insights without undoing a saved import.

    Serialization, engine construction, database operations and rollback all
    stay in this worker. The caller captures user_id before any commit can
    expire the request's ORM user.
    """
    logger.info("Processing %d rows for user_id=%s", len(payload.rows), user_id)
    try:
        rows = [row.model_dump() for row in payload.rows]
        stats = SyncEngine(db, user_id=user_id).import_rows(
            rows=rows,
            file_name=payload.file_name,
            file_hash=payload.file_hash,
            force=payload.force,
        )
        analytics_status: Literal["ready", "failed"] = "ready"
        analytics_message = None
        try:
            AnalyticsEngine(db, user_id=user_id).refresh_analytics(source_file=payload.file_name)
        except Exception as exc:
            logger.warning(
                "Post-upload analytics failed for user_id=%s (%s)", user_id, type(exc).__name__
            )
            db.rollback()
            analytics_status = "failed"
            analytics_message = (
                "Your ledger is saved. Insights could not be refreshed. Retry the refresh."
            )
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
            analytics_message=analytics_message,
        )
    except Exception:
        db.rollback()
        raise
