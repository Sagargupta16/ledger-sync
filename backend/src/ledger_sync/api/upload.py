"""Upload API endpoint for pre-parsed transaction data.

The frontend parses Excel/CSV files client-side and sends structured JSON
rows. This endpoint validates, normalizes, hashes, and reconciles
transactions, then triggers analytics recomputation so pre-aggregated
tables (monthly_summaries, daily_summaries, investment_holdings, etc.)
stay in sync with the raw transactions. The explicit POST
/api/analytics/v2/refresh endpoint remains available for manual re-syncs.
"""

from datetime import UTC
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import desc, func, select
from sqlalchemy.exc import SQLAlchemyError
from starlette.concurrency import run_in_threadpool

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.api.rate_limit import _user_key_func, limiter
from ledger_sync.core.sync_engine import AlreadyImportedError
from ledger_sync.db.models import ImportLog
from ledger_sync.ingest.normalizer import NormalizationError
from ledger_sync.schemas.transactions import (
    ImportHistoryEntry,
    ImportHistoryResponse,
    UploadResponse,
)
from ledger_sync.schemas.upload import TransactionUploadRequest
from ledger_sync.services.upload_service import process_upload
from ledger_sync.utils.logging import logger

router = APIRouter(prefix="", tags=["upload"])

# Register both bounds on the same limiter so SlowAPI checks both keys.
# The wider IP limit accommodates accounts sharing a carrier or office network.


@router.post(
    "/api/upload",
    responses={
        400: {"description": "Data format issue"},
        409: {"description": "File already imported"},
        413: {"description": "Upload exceeds configured size limit"},
        422: {"description": "Validation error"},
        429: {"description": "Rate limit exceeded"},
        500: {"description": "Processing failed"},
    },
)
@limiter.limit("10/minute", key_func=_user_key_func)
@limiter.limit("50/minute")
async def upload_transactions(
    request: Request,  # required by slowapi
    payload: TransactionUploadRequest,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> UploadResponse:
    """Replace the current user's ledger with a complete INR snapshot.

    Include every account and date to retain; missing entries are soft-deleted.
    The frontend validates and confirms the snapshot before sending JSON. This
    endpoint normalizes, hashes, reconciles the transactions, and then
    triggers a versioned analytics refresh so pre-aggregated tables stay in
    sync with the raw data. If the analytics step fails the upload still
    succeeds and the user can re-run POST /api/analytics/v2/refresh.

    Args:
        payload: JSON body with file_name, file_hash, rows, and force flag.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        Upload response with statistics.

    Raises:
        HTTPException: If upload fails.

    """
    try:
        return await run_in_threadpool(process_upload, db, current_user.id, payload)

    except AlreadyImportedError as e:
        logger.warning("Upload rejected: already imported")
        raise HTTPException(status_code=409, detail=str(e)) from e

    except NormalizationError as e:
        logger.warning("Upload rejected: normalization error")
        raise HTTPException(
            status_code=400,
            detail=f"Data format issue: {e}",
        ) from e

    except (OSError, RuntimeError, SQLAlchemyError) as e:
        logger.error("Upload processing failed (%s)", type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail="Failed to process data. Please try again.",
        ) from e


@router.get("/api/upload/history")
def get_import_history(
    current_user: CurrentUser,
    db: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=100, description="Imports to return")] = 10,
) -> ImportHistoryResponse:
    """List this user's past imports, most recent first.

    ``import_logs`` has always been written on every upload -- it is what makes
    re-importing the same file idempotent -- but nothing ever showed it back to
    the user, so there was no way to answer "did that import actually land, and
    what did it change?" without opening the database. The Data Health page reads
    only the single latest row; this returns the series.

    ``total_count`` is the unpaginated total so the UI can say "showing 10 of N"
    rather than implying the list is complete.

    ``limit`` is a query parameter declared on the signature, matching how
    FastAPI resolves it -- declaring it as a body model here would make the
    browser's GET fail validation with a 422.
    """
    history_query = select(ImportLog).where(ImportLog.user_id == current_user.id)

    total_count = (
        db.execute(
            select(func.count()).select_from(ImportLog).where(ImportLog.user_id == current_user.id),
        ).scalar()
        or 0
    )

    rows = (
        db.execute(history_query.order_by(desc(ImportLog.imported_at)).limit(limit)).scalars().all()
    )

    return ImportHistoryResponse(
        imports=[
            ImportHistoryEntry(
                id=row.id,
                file_name=row.file_name,
                file_hash=row.file_hash,
                # Stored naive but holding UTC, so the tzinfo is attached before
                # serializing. Without this the browser reads it as local time.
                imported_at=row.imported_at.replace(tzinfo=UTC).isoformat(),
                rows_processed=row.rows_processed,
                rows_inserted=row.rows_inserted,
                rows_updated=row.rows_updated,
                rows_deleted=row.rows_deleted,
                rows_skipped=row.rows_skipped,
            )
            for row in rows
        ],
        total_count=total_count,
    )
