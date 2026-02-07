"""Pydantic schemas for transaction-related API responses."""

from pydantic import BaseModel


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
