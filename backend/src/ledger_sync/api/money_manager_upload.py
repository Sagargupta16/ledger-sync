"""Money Manager backup upload: a raw ``.mmbak`` body instead of parsed JSON rows.

The browser gzips the backup (Vercel refuses bodies over 4.5 MB, and a real
backup is about 5 MB raw and 1.3 MB gzipped) and an iOS Shortcut can post the
same body with an upload token. The backup is read and reconciled on the
server; see services/money_manager_import.py.
"""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy.exc import SQLAlchemyError
from starlette.concurrency import run_in_threadpool

from ledger_sync.api.deps import DatabaseSession, UploadUser
from ledger_sync.api.rate_limit import _upload_key_func, limiter
from ledger_sync.core.sync_engine import LargeDeletionError
from ledger_sync.ingest.money_manager import MoneyManagerBackupError
from ledger_sync.ingest.normalizer import NormalizationError
from ledger_sync.schemas.money_manager import MoneyManagerUploadResponse
from ledger_sync.services.money_manager_import import (
    DEFAULT_FILE_NAME,
    BackupUpload,
    import_money_manager_backup,
)
from ledger_sync.utils.logging import logger

router = APIRouter(prefix="/api/upload", tags=["upload"])


@router.post(
    "/money-manager",
    responses={
        400: {"description": "Not a readable Money Manager backup, or a data format issue"},
        401: {"description": "Invalid access or upload token"},
        409: {"description": "The backup would remove many transactions; confirm first"},
        413: {"description": "Upload exceeds configured size limit"},
        429: {"description": "Rate limit exceeded"},
        500: {"description": "Processing failed"},
    },
)
@limiter.limit("10/minute;60/hour", key_func=_upload_key_func)
@limiter.limit("50/minute")
async def upload_money_manager_backup(
    request: Request,
    principal: UploadUser,
    db: DatabaseSession,
    file_name: Annotated[str, Query(min_length=1, max_length=500)] = DEFAULT_FILE_NAME,
    dry_run: bool = False,
    force: bool = False,
    allow_large_delete: bool = False,
) -> MoneyManagerUploadResponse:
    """Replace the ledger with a Money Manager backup, keeping each row's UID.

    The body is the backup itself, raw or gzip- or zip-compressed. ``dry_run``
    reports what would change and commits nothing. A backup that would remove
    more than 5% of the ledger (at least 25 rows) is refused with 409 unless
    ``allow_large_delete`` confirms a reviewed preview. Upload tokens can do
    neither: they always commit, always with the guard.
    """
    body = await request.body()
    upload = BackupUpload(
        file_name=file_name.strip() or DEFAULT_FILE_NAME,
        dry_run=dry_run and principal.token_id is None,
        force=force,
        allow_large_delete=allow_large_delete and principal.token_id is None,
    )
    try:
        return await run_in_threadpool(
            import_money_manager_backup, db, principal.user_id, body, upload
        )
    except MoneyManagerBackupError as e:
        logger.warning("Backup upload rejected: unreadable backup")
        raise HTTPException(status_code=400, detail=str(e)) from e
    except NormalizationError as e:
        logger.warning("Backup upload rejected: normalization error")
        raise HTTPException(status_code=400, detail=f"Data format issue: {e}") from e
    except LargeDeletionError as e:
        logger.warning("Backup upload held back: %d deletions", e.deleted)
        raise HTTPException(status_code=409, detail=str(e)) from e
    except (OSError, RuntimeError, SQLAlchemyError) as e:
        logger.error("Backup upload failed (%s)", type(e).__name__)
        raise HTTPException(
            status_code=500, detail="Failed to process the backup. Please try again."
        ) from e
