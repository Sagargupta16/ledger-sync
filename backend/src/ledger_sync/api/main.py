"""FastAPI application for ledger-sync web interface."""

import tempfile
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ledger_sync.core.sync_engine import SyncEngine
from ledger_sync.db.session import SessionLocal, init_db
from ledger_sync.utils.logging import logger, setup_logging

# Initialize logging
setup_logging("INFO")

# Initialize database
init_db()

app = FastAPI(
    title="Ledger Sync API",
    description="Modern API for Excel ingestion and reconciliation",
    version="1.0.0",
)

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
    ],  # Next.js and Vite default ports
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class UploadResponse(BaseModel):
    """Response model for file upload."""

    success: bool
    message: str
    stats: dict[str, int]
    file_name: str


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    version: str


@app.get("/", response_model=HealthResponse)
async def root() -> HealthResponse:
    """Root endpoint - health check."""
    return HealthResponse(status="healthy", version="1.0.0")


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse(status="healthy", version="1.0.0")


@app.post("/api/upload", response_model=UploadResponse)
async def upload_excel(
    file: Annotated[UploadFile, File(description="Excel file to import")],
    force: bool = False,
) -> UploadResponse:
    """Upload and process Excel file.

    Args:
        file: Excel file to import
        force: Force re-import even if file was previously imported

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
    logger.info(f"Processing uploaded file: {file.filename}")

    # Create session and process file
    session = SessionLocal()
    try:
        engine = SyncEngine(session)
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
        )

    except Exception as e:
        logger.error(f"Error processing file: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error processing file: {str(e)}",
        )

    finally:
        session.close()
        # Clean up temporary file
        if tmp_path and tmp_path.exists():
            try:
                tmp_path.unlink()
            except PermissionError:
                # On Windows, file might still be locked, ignore
                pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
