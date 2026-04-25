"""Upload API endpoint for pre-parsed transaction data.

The frontend parses Excel/CSV files client-side and sends structured JSON
rows. This endpoint validates, normalizes, hashes, and reconciles
transactions, then triggers analytics recomputation so pre-aggregated
tables (monthly_summaries, daily_summaries, investment_holdings, etc.)
stay in sync with the raw transactions. The explicit POST
/api/analytics/v2/refresh endpoint remains available for manual re-syncs.
"""

import anyio
from fastapi import APIRouter, HTTPException

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.analytics import AnalyticsEngine
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

    The frontend parses Excel/CSV files and sends structured JSON. This
    endpoint normalizes, hashes, reconciles the transactions, and then
    triggers a full analytics refresh so pre-aggregated tables stay in
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

        # Defense-in-depth: recompute analytics synchronously so pre-aggregated
        # tables (monthly/daily summaries, category trends, investment
        # holdings, etc.) stay consistent with the raw transactions even if
        # the client skips the explicit /api/analytics/v2/refresh call.
        try:
            analytics = AnalyticsEngine(db, user_id=current_user.id)
            await anyio.to_thread.run_sync(
                lambda: analytics.run_full_analytics(source_file=payload.file_name),
            )
        except (OSError, RuntimeError, ValueError) as exc:
            # Don't fail the upload if the post-upload refresh blows up -- the
            # raw data is safely persisted; the user can re-run /refresh.
            logger.warning(
                "Post-upload analytics refresh failed for user_id=%s: %s",
                current_user.id,
                exc,
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
