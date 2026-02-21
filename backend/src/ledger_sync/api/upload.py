"""Upload API endpoint for Excel and CSV file ingestion."""

import atexit
import os
import tempfile
from pathlib import Path
from typing import Annotated

import anyio
from fastapi import APIRouter, File, HTTPException, UploadFile

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.config.settings import settings
from ledger_sync.core.sync_engine import SyncEngine
from ledger_sync.ingest.normalizer import NormalizationError
from ledger_sync.ingest.validator import ValidationError
from ledger_sync.schemas.transactions import UploadResponse
from ledger_sync.utils.logging import logger

router = APIRouter(prefix="", tags=["upload"])

# Accepted file extensions
_XLSX_EXT = ".xlsx"
_XLS_EXT = ".xls"
_CSV_EXT = ".csv"
_ACCEPTED_EXTENSIONS = (_XLSX_EXT, _XLS_EXT, _CSV_EXT)

# Excel file magic bytes for validation
_XLSX_MAGIC = b"PK"  # ZIP archive (OOXML format)
_XLS_MAGIC = b"\xd0\xcf\x11\xe0"  # OLE2 compound document


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

    if not filename.endswith(_ACCEPTED_EXTENSIONS):
        allowed = ", ".join(_ACCEPTED_EXTENSIONS)
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Expected one of {allowed}, got {filename}",
        )

    return filename


def _validate_file_content(content: bytes, filename: str) -> None:
    """Validate file content matches expected format via magic bytes.

    CSV files start with plain text, so magic-byte validation is skipped for them.

    Args:
        content: The raw file bytes.
        filename: The original filename (used to determine expected format).

    Raises:
        HTTPException: If content doesn't match expected Excel magic bytes.

    """
    # CSV files are plain text — skip magic-byte validation
    if filename.endswith(_CSV_EXT):
        return

    if filename.endswith(_XLSX_EXT) and not content[:2].startswith(_XLSX_MAGIC):
        raise HTTPException(
            status_code=400,
            detail=f"File content does not match {_XLSX_EXT} format",
        )
    if filename.endswith(_XLS_EXT) and not content[:4].startswith(_XLS_MAGIC):
        raise HTTPException(
            status_code=400,
            detail=f"File content does not match {_XLS_EXT} format",
        )


async def _create_temp_file(file: UploadFile, filename: str) -> Path:
    """Read uploaded file content and write it to a temporary file.

    Enforces file size limit and validates content magic bytes.

    Args:
        file: The uploaded file object.
        filename: The validated filename.

    Returns:
        Path to the created temporary file.

    Raises:
        HTTPException: If file exceeds size limit or content is invalid.

    """
    content = await file.read()

    # Enforce file size limit
    if len(content) > settings.max_upload_size_bytes:
        max_mb = settings.max_upload_size_bytes / (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {max_mb:.0f} MB.",
        )

    # Validate file content magic bytes
    _validate_file_content(content, filename)

    suffix = Path(filename).suffix
    tmp_fd, tmp_name = tempfile.mkstemp(suffix=suffix)
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
        413: {"description": "File too large"},
        422: {"description": "Invalid Excel file"},
        500: {"description": "Processing failed"},
    },
)
async def upload_excel(
    current_user: CurrentUser,
    file: Annotated[UploadFile, File(description="Excel or CSV file to import")],
    db: DatabaseSession,
    force: bool = False,
) -> UploadResponse:
    """Upload and process an Excel or CSV file.

    Args:
        current_user: Authenticated user
        file: Excel (.xlsx, .xls) or CSV (.csv) file to import
        force: Force re-import even if file was previously imported
        db: Database session

    Returns:
        Upload response with statistics

    Raises:
        HTTPException: If upload fails

    """
    filename = _validate_upload_file(file.filename)
    tmp_path = await _create_temp_file(file, filename)

    logger.info(f"Processing uploaded file: {filename} for user: {current_user.email}")

    try:
        engine = SyncEngine(db, user_id=current_user.id)
        # Run synchronous import in a thread to avoid blocking the event loop
        stats = await anyio.to_thread.run_sync(lambda: engine.import_file(tmp_path, force=force))

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
