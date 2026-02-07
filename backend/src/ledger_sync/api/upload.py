"""Upload API endpoint for Excel file ingestion."""

import atexit
import os
import tempfile
from pathlib import Path
from typing import Annotated

import anyio
from fastapi import APIRouter, File, HTTPException, UploadFile

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.sync_engine import SyncEngine
from ledger_sync.ingest.normalizer import NormalizationError
from ledger_sync.ingest.validator import ValidationError
from ledger_sync.schemas.transactions import UploadResponse
from ledger_sync.utils.logging import logger

router = APIRouter(prefix="", tags=["upload"])


def _validate_upload_file(filename: str | None) -> str:
    """Validate the uploaded file has a filename and an accepted extension.

    Args:
        filename: The filename from the uploaded file.

    Returns:
        The validated filename.

    Raises:
        HTTPException: If the filename is missing or has an invalid extension.

    """
    if not filename:
        raise HTTPException(status_code=400, detail="No file provided")

    if not filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Expected .xlsx or .xls, got {filename}",
        )

    return filename


async def _create_temp_file(file: UploadFile) -> Path:
    """Read uploaded file content and write it to a temporary file.

    Args:
        file: The uploaded file object.

    Returns:
        Path to the created temporary file.

    """
    content = await file.read()
    tmp_fd, tmp_name = tempfile.mkstemp(suffix=".xlsx")
    os.close(tmp_fd)
    tmp_path = Path(tmp_name)
    await anyio.Path(tmp_path).write_bytes(content)
    return tmp_path


def _cleanup_temp_file(tmp_path: Path) -> None:
    """Remove the temporary file, scheduling deferred cleanup on Windows lock errors.

    Args:
        tmp_path: Path to the temporary file to remove.

    """
    if not tmp_path.exists():
        return

    try:
        tmp_path.unlink()
    except PermissionError:
        # On Windows, file might still be locked, schedule for later cleanup
        def cleanup_later() -> None:
            try:
                if tmp_path.exists():
                    tmp_path.unlink()
            except OSError:
                pass

        atexit.register(cleanup_later)
    except OSError as cleanup_error:
        logger.warning(f"Failed to clean up temp file {tmp_path}: {cleanup_error}")


@router.post(
    "/api/upload",
    responses={
        400: {"description": "Invalid file type, no file provided, or data format issue"},
        409: {"description": "File already imported"},
        422: {"description": "Invalid Excel file"},
        500: {"description": "Processing failed"},
    },
)
async def upload_excel(
    current_user: CurrentUser,
    file: Annotated[UploadFile, File(description="Excel file to import")],
    db: DatabaseSession,
    force: bool = False,
) -> UploadResponse:
    """Upload and process Excel file.

    Args:
        current_user: Authenticated user
        file: Excel file to import
        force: Force re-import even if file was previously imported
        db: Database session

    Returns:
        Upload response with statistics

    Raises:
        HTTPException: If upload fails

    """
    filename = _validate_upload_file(file.filename)
    tmp_path = await _create_temp_file(file)

    logger.info(f"Processing uploaded file: {filename} for user: {current_user.email}")

    try:
        engine = SyncEngine(db, user_id=current_user.id)
        stats = engine.import_file(tmp_path, force=force)

        return UploadResponse(
            success=True,
            message=f"Successfully processed {filename}",
            stats={
                "processed": stats.processed,
                "inserted": stats.inserted,
                "updated": stats.updated,
                "deleted": stats.deleted,
                "unchanged": stats.skipped,
            },
            file_name=filename,
        )

    except ValueError as e:
        logger.warning(f"File already imported: {e}")
        raise HTTPException(
            status_code=409,
            detail=str(e),
        ) from e

    except ValidationError as e:
        logger.warning(f"Invalid Excel file: {e}")
        raise HTTPException(
            status_code=422,
            detail=f"Invalid Excel file: {e!s}",
        ) from e

    except NormalizationError as e:
        logger.warning(f"Data format issue: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Data format issue: {e!s}",
        ) from e

    except (OSError, RuntimeError) as e:
        logger.error(f"Unexpected error processing file: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to process file. Please check the file format and try again.",
        ) from e

    finally:
        _cleanup_temp_file(tmp_path)
