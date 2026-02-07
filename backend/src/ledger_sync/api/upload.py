"""Upload API endpoint for Excel file ingestion."""

import tempfile
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ledger_sync.api.deps import CurrentUser
from ledger_sync.core.sync_engine import SyncEngine
from ledger_sync.db.session import get_session
from ledger_sync.ingest.normalizer import NormalizationError
from ledger_sync.ingest.validator import ValidationError
from ledger_sync.schemas.transactions import UploadResponse
from ledger_sync.utils.logging import logger

router = APIRouter(prefix="", tags=["upload"])


@router.post("/api/upload", response_model=UploadResponse)
async def upload_excel(
    current_user: CurrentUser,
    file: Annotated[UploadFile, File(description="Excel file to import")],
    force: bool = False,
    db: Session = Depends(get_session),
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
    # Validate file type
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Expected .xlsx or .xls, got {file.filename}",
        )

    # Create temporary file
    tmp_path = None
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp_file:
        # Write uploaded file to temp location
        content = await file.read()
        tmp_file.write(content)
        tmp_file.flush()
        tmp_path = Path(tmp_file.name)

    # Process file after closing the temp file handle
    logger.info(f"Processing uploaded file: {file.filename} for user: {current_user.email}")

    try:
        engine = SyncEngine(db, user_id=current_user.id)
        stats = engine.import_file(tmp_path, force=force)

        # Build response
        return UploadResponse(
            success=True,
            message=f"Successfully processed {file.filename}",
            stats={
                "processed": stats.processed,
                "inserted": stats.inserted,
                "updated": stats.updated,
                "deleted": stats.deleted,
                "unchanged": stats.skipped,
            },
            file_name=file.filename,
        )

    except ValueError as e:
        # File already imported
        logger.warning(f"File already imported: {e}")
        raise HTTPException(
            status_code=409,
            detail=str(e),
        ) from e

    except ValidationError as e:
        # Excel validation failed
        logger.warning(f"Invalid Excel file: {e}")
        raise HTTPException(
            status_code=422,
            detail=f"Invalid Excel file: {e!s}",
        ) from e

    except NormalizationError as e:
        # Data normalization failed
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
        # Clean up temporary file
        if tmp_path and tmp_path.exists():
            try:
                tmp_path.unlink()
            except PermissionError:
                # On Windows, file might still be locked, schedule for later cleanup
                import atexit

                def cleanup_later():
                    try:
                        if tmp_path.exists():
                            tmp_path.unlink()
                    except OSError:
                        pass

                atexit.register(cleanup_later)
            except OSError as cleanup_error:
                logger.warning(f"Failed to clean up temp file {tmp_path}: {cleanup_error}")
