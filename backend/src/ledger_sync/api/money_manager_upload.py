"""Money Manager backup upload: a raw ``.mmbak`` body instead of parsed JSON rows.

The browser gzips the backup (Vercel refuses bodies over 4.5 MB, and a real
backup is about 5 MB raw and 1.3 MB gzipped) and an iOS Shortcut can post the
same body with an upload token. The backup is read and reconciled on the
server; see services/money_manager_import.py.
"""

import secrets
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response
from sqlalchemy.exc import SQLAlchemyError
from starlette.concurrency import run_in_threadpool

from ledger_sync.api.deps import DatabaseSession, UploadUser
from ledger_sync.api.rate_limit import _upload_key_func, limiter
from ledger_sync.core.sync_engine import LargeDeletionError
from ledger_sync.ingest.money_manager import MoneyManagerBackupError
from ledger_sync.ingest.normalizer import NormalizationError
from ledger_sync.schemas.money_manager import MoneyManagerUploadResponse
from ledger_sync.services.idempotency import (
    IdempotencyConflictError,
    IdempotencyScope,
    IdempotentRoute,
    InvalidIdempotencyKeyError,
    parse_key,
    request_fingerprint,
)
from ledger_sync.services.money_manager_import import (
    DEFAULT_FILE_NAME,
    BackupUpload,
    import_money_manager_backup_once,
)
from ledger_sync.utils.logging import logger

router = APIRouter(prefix="/api/upload", tags=["upload"])


@router.post(
    "/money-manager",
    responses={
        400: {
            "description": (
                "Not a readable Money Manager backup, a data format issue, or a malformed "
                "Idempotency-Key"
            )
        },
        401: {"description": "Invalid access or upload token"},
        409: {
            "description": (
                "The backup would remove many transactions; confirm first. Or an upload "
                "with this Idempotency-Key is still running (Retry-After)"
            )
        },
        413: {"description": "Upload exceeds configured size limit"},
        422: {"description": "An Idempotency-Key used for a different upload"},
        429: {"description": "Rate limit exceeded"},
        500: {"description": "Processing failed"},
    },
)
@limiter.limit("10/minute;60/hour", key_func=_upload_key_func)
@limiter.limit("50/minute")
async def upload_money_manager_backup(
    request: Request,
    response: Response,
    principal: UploadUser,
    db: DatabaseSession,
    file_name: Annotated[str, Query(min_length=1, max_length=500)] = DEFAULT_FILE_NAME,
    dry_run: bool = False,
    force: bool = False,
    allow_large_delete: bool = False,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> MoneyManagerUploadResponse:
    """Replace the ledger with a Money Manager backup, keeping each row's UID.

    The body is the backup itself, raw or gzip- or zip-compressed. ``dry_run``
    reports what would change and commits nothing. A backup that would remove
    more than 5% of the ledger (at least 25 rows) is refused with 409 unless
    ``allow_large_delete`` confirms a reviewed preview. Upload tokens can do
    neither: they always commit, always with the guard.

    An optional ``Idempotency-Key`` makes a retried commit safe: the same key,
    options and body return the first result (with ``Idempotent-Replayed:
    true``). Dry runs ignore it.
    """
    try:
        key = parse_key(idempotency_key)
    except InvalidIdempotencyKeyError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    body = await request.body()
    upload = BackupUpload(
        file_name=file_name.strip() or DEFAULT_FILE_NAME,
        dry_run=dry_run and principal.token_id is None,
        force=force,
        allow_large_delete=allow_large_delete and principal.token_id is None,
    )
    scope = None
    if key is not None and not upload.dry_run:
        params = (upload.file_name, str(upload.force), str(upload.allow_large_delete))
        fingerprint = request_fingerprint(IdempotentRoute.MONEY_MANAGER, body, params)
        scope = IdempotencyScope(principal.user_id, IdempotentRoute.MONEY_MANAGER, key, fingerprint)
    try:
        result, replayed = await run_in_threadpool(
            import_money_manager_backup_once, db, principal.user_id, body, upload, scope
        )
    except IdempotencyConflictError as e:
        logger.warning("Backup upload refused: Idempotency-Key conflict (%d)", e.status_code)
        headers = {"Retry-After": str(e.retry_after)} if e.retry_after is not None else None
        raise HTTPException(status_code=e.status_code, detail=e.detail, headers=headers) from e
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
        error_id = secrets.token_hex(8)
        logger.error("Backup upload failed [%s]: %s", error_id, type(e).__name__, exc_info=e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process the backup. Please try again. (error id {error_id})",
        ) from e
    if replayed:
        response.headers["Idempotent-Replayed"] = "true"
    return result
