"""Upload API endpoint for pre-parsed transaction data.

The frontend parses Excel/CSV files client-side and sends structured JSON rows.
This endpoint validates, normalizes, hashes, and reconciles transactions.
Analytics recomputation is triggered separately via POST /api/analytics/v2/refresh.
"""

import anyio
from fastapi import APIRouter, HTTPException

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.sync_engine import SyncEngine
from ledger_sync.ingest.normalizer import NormalizationError
from ledger_sync.schemas.transactions import UploadResponse
from ledger_sync.schemas.upload import TransactionUploadRequest
from ledger_sync.utils.logging import logger

router = APIRouter(prefix="", tags=["upload"])


@router.post(
    "/api/upload",
    responses={
        400: {"description": "Data format issue"},
        409: {"description": "File already imported"},
        422: {"description": "Validation error"},
        500: {"description": "Processing failed"},
    },
)
async def upload_transactions(
    payload: TransactionUploadRequest,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> UploadResponse:
    """Upload pre-parsed transaction rows.

    The frontend parses Excel/CSV files and sends structured JSON.
    This endpoint normalizes, hashes, and reconciles transactions.
    Analytics recomputation is triggered by the frontend via a
    separate POST /api/analytics/v2/refresh call after upload.

    Args:
        payload: JSON body with file_name, file_hash, rows, and force flag.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        Upload response with statistics.

    Raises:
        HTTPException: If upload fails.

    """
    logger.info(
        "Processing %d rows from %s for user_id=%s",
        len(payload.rows),
        payload.file_name,
        current_user.id,
    )

    try:
        engine = SyncEngine(db, user_id=current_user.id)
        rows_as_dicts = [row.model_dump() for row in payload.rows]
        stats = await anyio.to_thread.run_sync(
            lambda: engine.import_rows(
                rows=rows_as_dicts,
                file_name=payload.file_name,
                file_hash=payload.file_hash,
                force=payload.force,
            )
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
        )

    except ValueError as e:
        logger.warning("File already imported: %s", e)
        raise HTTPException(status_code=409, detail=str(e)) from e

    except NormalizationError as e:
        logger.warning("Data format issue: %s", e)
        raise HTTPException(
            status_code=400,
            detail=f"Data format issue: {e}",
        ) from e

    except (OSError, RuntimeError) as e:
        logger.error("Unexpected error processing upload: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to process data. Please try again.",
        ) from e
