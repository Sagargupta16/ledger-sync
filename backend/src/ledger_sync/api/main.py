"""FastAPI application for ledger-sync web interface."""

import csv
import io
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, File, HTTPException, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ledger_sync.api.account_classifications import router as account_classifications_router
from ledger_sync.api.analytics import router as analytics_router
from ledger_sync.api.analytics_v2 import router as analytics_v2_router
from ledger_sync.api.calculations import router as calculations_router
from ledger_sync.api.meta import router as meta_router
from ledger_sync.api.preferences import router as preferences_router
from ledger_sync.config.settings import settings
from ledger_sync.core.sync_engine import SyncEngine
from ledger_sync.db.models import Transaction
from ledger_sync.db.session import get_session, init_db
from ledger_sync.ingest.normalizer import NormalizationError
from ledger_sync.ingest.validator import ValidationError
from ledger_sync.utils.logging import logger, setup_logging

# Query description constants
START_DATE_DESC = "Start date (inclusive)"
END_DATE_DESC = "End date (inclusive)"

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
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(analytics_router)
app.include_router(analytics_v2_router)
app.include_router(calculations_router)
app.include_router(meta_router)
app.include_router(account_classifications_router)
app.include_router(preferences_router)


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


class TransactionResponse(BaseModel):
    """Single transaction response model."""

    id: str
    date: str
    amount: float
    currency: str
    type: str
    category: str
    subcategory: str
    account: str
    from_account: str | None
    to_account: str | None
    note: str
    source_file: str
    last_seen_at: str
    is_transfer: bool


class TransactionsListResponse(BaseModel):
    """Paginated transactions list response."""

    data: list[TransactionResponse]
    total: int
    limit: int
    offset: int
    has_more: bool


@app.get("/", response_model=HealthResponse)
async def root() -> HealthResponse:
    """Root endpoint - health check."""
    return HealthResponse(status="healthy", version="1.0.0")


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse(status="healthy", version="1.0.0")


@app.get("/api/transactions", response_model=TransactionsListResponse)
async def get_transactions(
    db: Session = Depends(get_session),
    start_date: datetime | None = Query(None, description=START_DATE_DESC),
    end_date: datetime | None = Query(None, description=END_DATE_DESC),
    limit: int = Query(100, ge=1, le=1000, description="Maximum results to return"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
) -> TransactionsListResponse:
    """Get all non-deleted transactions (including transfers) with pagination.

    Args:
        db: Database session
        start_date: Optional start date filter (inclusive)
        end_date: Optional end date filter (inclusive)
        limit: Maximum number of results to return
        offset: Number of results to skip (for pagination)

    Returns:
        Paginated list of transactions in JSON format

    """
    # Build query
    query = db.query(Transaction).filter(Transaction.is_deleted.is_(False))

    # Apply date filters if provided
    if start_date:
        query = query.filter(Transaction.date >= start_date.date())
    if end_date:
        query = query.filter(Transaction.date <= end_date.date())

    # Get total count before pagination
    total = query.count()

    # Apply sorting and pagination
    transactions = query.order_by(Transaction.date.desc()).offset(offset).limit(limit).all()

    # Convert transactions to response objects
    result = [
        TransactionResponse(
            id=tx.transaction_id,
            date=tx.date.isoformat(),
            amount=float(tx.amount),
            currency=tx.currency,
            type=tx.type.value,
            category=tx.category,
            subcategory=tx.subcategory or "",
            account=tx.account,
            from_account=tx.from_account,
            to_account=tx.to_account,
            note=tx.note or "",
            source_file=tx.source_file,
            last_seen_at=tx.last_seen_at.isoformat(),
            is_transfer=tx.type.value == "Transfer",
        )
        for tx in transactions
    ]

    return TransactionsListResponse(
        data=result,
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + limit < total,
    )


@app.get("/api/transactions/search")
async def search_transactions(
    db: Session = Depends(get_session),
    query: str | None = Query(None, description="Search in notes, category, account"),
    category: str | None = Query(None, description="Filter by category"),
    subcategory: str | None = Query(None, description="Filter by subcategory"),
    account: str | None = Query(None, description="Filter by account"),
    type: str | None = Query(None, description="Filter by type (Income/Expense/Transfer)"),
    min_amount: float | None = Query(None, description="Minimum amount"),
    max_amount: float | None = Query(None, description="Maximum amount"),
    start_date: datetime | None = Query(None, description=START_DATE_DESC),
    end_date: datetime | None = Query(None, description=END_DATE_DESC),
    limit: int = Query(100, ge=1, le=1000, description="Maximum results to return"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    sort_by: str = Query(
        "date",
        pattern="^(date|amount|category|account)$",
        description="Sort field",
    ),
    sort_order: str = Query("desc", pattern="^(asc|desc)$", description="Sort order"),
) -> dict[str, Any]:
    """Search and filter transactions with pagination.

    Args:
        db: Database session
        query: Text search in notes, category, account (case-insensitive)
        category: Filter by exact category match
        subcategory: Filter by exact subcategory match
        account: Filter by exact account match
        type: Filter by transaction type
        min_amount: Minimum transaction amount
        max_amount: Maximum transaction amount
        start_date: Filter transactions from this date onwards
        end_date: Filter transactions up to this date
        limit: Maximum number of results to return
        offset: Number of results to skip (for pagination)
        sort_by: Field to sort by
        sort_order: Sort direction (asc/desc)

    Returns:
        Dictionary with filtered transactions, total count, and pagination info

    """
    # Start with base query
    tx_query = db.query(Transaction).filter(Transaction.is_deleted.is_(False))

    # Apply date filters
    if start_date:
        tx_query = tx_query.filter(Transaction.date >= start_date)
    if end_date:
        tx_query = tx_query.filter(Transaction.date <= end_date)

    # Apply amount filters
    if min_amount is not None:
        tx_query = tx_query.filter(Transaction.amount >= min_amount)
    if max_amount is not None:
        tx_query = tx_query.filter(Transaction.amount <= max_amount)

    # Apply category filter
    if category:
        tx_query = tx_query.filter(Transaction.category == category)

    # Apply subcategory filter
    if subcategory:
        tx_query = tx_query.filter(Transaction.subcategory == subcategory)

    # Apply account filter (for transactions: account, for transfers: from_account or to_account)
    if account:
        tx_query = tx_query.filter(
            (Transaction.account == account)
            | (Transaction.from_account == account)
            | (Transaction.to_account == account),
        )

    # Apply type filter
    if type:
        type_lower = type.lower()
        from ledger_sync.db.models import TransactionType

        if type_lower == "income":
            tx_query = tx_query.filter(Transaction.type == TransactionType.INCOME)
        elif type_lower == "expense":
            tx_query = tx_query.filter(Transaction.type == TransactionType.EXPENSE)
        elif type_lower == "transfer":
            tx_query = tx_query.filter(Transaction.type == TransactionType.TRANSFER)

    # Get results
    transactions = tx_query.all()

    # Convert to result format
    result = [
        {
            "id": tx.transaction_id,
            "date": tx.date.isoformat(),
            "amount": float(tx.amount),
            "currency": tx.currency,
            "type": tx.type.value,
            "category": tx.category,
            "subcategory": tx.subcategory or "",
            "account": tx.account,
            "from_account": tx.from_account,
            "to_account": tx.to_account,
            "note": tx.note or "",
            "source_file": tx.source_file,
            "last_seen_at": tx.last_seen_at.isoformat(),
            "is_transfer": tx.type.value == "Transfer",
        }
        for tx in transactions
    ]

    # Apply text search filter (client-side since it's across multiple fields)
    if query:
        query_lower = query.lower()
        result = [
            tx
            for tx in result
            if query_lower in tx["note"].lower()
            or query_lower in tx["category"].lower()
            or query_lower in tx["account"].lower()
            or ("subcategory" in tx and query_lower in tx["subcategory"].lower())
        ]

    # Get total before pagination
    total = len(result)

    # Apply sorting
    reverse = sort_order == "desc"
    result.sort(key=lambda x: x[sort_by], reverse=reverse)

    # Apply pagination
    paginated_result = result[offset : offset + limit]

    return {
        "data": paginated_result,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + limit < total,
    }


@app.post("/api/upload", response_model=UploadResponse)
async def upload_excel(
    file: Annotated[UploadFile, File(description="Excel file to import")],
    force: bool = False,
    db: Session = Depends(get_session),
) -> UploadResponse:
    """Upload and process Excel file.

    Args:
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
    logger.info(f"Processing uploaded file: {file.filename}")

    try:
        engine = SyncEngine(db)
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
        ) from None

    except ValidationError as e:
        # Excel validation failed
        logger.warning(f"Invalid Excel file: {e}")
        raise HTTPException(
            status_code=422,
            detail=f"Invalid Excel file: {e!s}",
        ) from None

    except NormalizationError as e:
        # Data normalization failed
        logger.warning(f"Data format issue: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Data format issue: {e!s}",
        ) from None

    except (OSError, RuntimeError) as e:
        logger.error(f"Unexpected error processing file: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to process file. Please check the file format and try again.",
        ) from None

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


# --- CSV Export Endpoint ---
@app.get("/api/transactions/export")
async def export_transactions(
    db: Session = Depends(get_session),
    start_date: datetime | None = Query(None, description=START_DATE_DESC),
    end_date: datetime | None = Query(None, description=END_DATE_DESC),
):
    """Export all non-deleted transactions as CSV."""
    query = db.query(Transaction).filter(Transaction.is_deleted.is_(False))
    if start_date:
        query = query.filter(Transaction.date >= start_date.date())
    if end_date:
        query = query.filter(Transaction.date <= end_date.date())
    transactions = query.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "id",
            "date",
            "amount",
            "currency",
            "type",
            "category",
            "subcategory",
            "account",
            "from_account",
            "to_account",
            "note",
            "source_file",
            "last_seen_at",
        ],
    )
    for tx in transactions:
        writer.writerow(
            [
                tx.transaction_id,
                tx.date.isoformat(),
                float(tx.amount),
                tx.currency,
                tx.type.value,
                tx.category,
                tx.subcategory or "",
                tx.account,
                tx.from_account,
                tx.to_account,
                tx.note or "",
                tx.source_file,
                tx.last_seen_at.isoformat(),
            ],
        )
    output.seek(0)
    return Response(
        content=output.read(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=transactions.csv"},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
