"""Pydantic schemas for transaction-related API requests and responses."""

from datetime import datetime

from pydantic import BaseModel, Field


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
    from_account: str | None = None
    to_account: str | None = None
    note: str
    source_file: str
    last_seen_at: str
    is_transfer: bool
    tags: list[str] = Field(default_factory=list)


class TransactionsListResponse(BaseModel):
    """Paginated transactions list response."""

    data: list[TransactionResponse]
    total: int
    limit: int
    offset: int
    has_more: bool


class TagFacet(BaseModel):
    """Single tag facet entry: tag name plus live-transaction usage count."""

    name: str
    count: int


class TransactionFacetsResponse(BaseModel):
    """Lightweight facets for the Transactions page UI.

    Replaces three full-table fetches (the page previously pulled every
    transaction just to derive dropdown options and type counts). Computed
    server-side via ``GROUP BY`` / ``DISTINCT`` so the browser never sees the
    raw ledger.
    """

    categories: list[str]
    accounts: list[str]
    tags: list[TagFacet] = Field(default_factory=list)
    income_count: int
    expense_count: int
    transfer_count: int
    total_count: int


class TransactionCreateRequest(BaseModel):
    """Request schema for manually creating a single transaction.

    The ``type`` field accepts ``Income``, ``Expense``, or ``Transfer``.
    For transfers, ``from_account`` and ``to_account`` should be provided.
    """

    date: datetime = Field(..., description="Transaction date")
    amount: float = Field(..., gt=0, description="Transaction amount (positive)")
    type: str = Field(
        ...,
        pattern="^(Income|Expense|Transfer)$",
        description="Transaction type: Income, Expense, or Transfer",
    )
    category: str = Field(..., min_length=1, description="Transaction category")
    subcategory: str | None = Field(None, description="Optional subcategory")
    account: str = Field(..., min_length=1, description="Account name")
    note: str | None = Field(None, description="Optional note or description")
    from_account: str | None = Field(None, description="Source account (for transfers)")
    to_account: str | None = Field(None, description="Destination account (for transfers)")


class TransactionTagsUpdateRequest(BaseModel):
    """Request schema for replacing a transaction's tag list.

    Full replacement: an empty list clears all tags. The router
    additionally validates each tag trimmed to 1-50 chars.
    """

    tags: list[str] = Field(..., max_length=10, description="Full replacement tag list")
