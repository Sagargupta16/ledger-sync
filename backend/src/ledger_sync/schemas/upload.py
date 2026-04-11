"""Pydantic schemas for the JSON-based upload endpoint."""

from pydantic import BaseModel, Field


class TransactionRow(BaseModel):
    """A single pre-parsed transaction row from the frontend."""

    date: str = Field(..., description="ISO 8601 date string, e.g. 2024-01-15")
    amount: float = Field(..., gt=0, description="Positive transaction amount")
    currency: str = Field("INR", description="ISO currency code")
    type: str = Field(..., description="Income, Expense, Transfer-In, or Transfer-Out")
    account: str = Field(..., min_length=1, description="Account name")
    category: str = Field(..., min_length=1, description="Category name")
    subcategory: str | None = Field(None, description="Optional subcategory")
    note: str | None = Field(None, description="Optional note")


class TransactionUploadRequest(BaseModel):
    """Request body for the JSON upload endpoint."""

    file_name: str = Field(..., min_length=1, description="Original file name")
    file_hash: str = Field(
        ..., min_length=64, max_length=64, description="SHA-256 hex hash of raw file"
    )
    rows: list[TransactionRow] = Field(..., min_length=1, description="Parsed transaction rows")
    force: bool = Field(False, description="Force re-import even if file was previously imported")
