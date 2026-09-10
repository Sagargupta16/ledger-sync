"""Pydantic schemas for the JSON-based upload endpoint."""

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Cap a single upload at 100k rows. Real bank statements are well under this
# (a busy year of daily transactions is ~3k rows); this bound just prevents
# an authenticated client from sending a gigabytes-large body.
MAX_UPLOAD_ROWS = 100_000
MAX_LABEL_LENGTH = 255
MAX_NOTE_LENGTH = 10_000
MAX_FILE_NAME_LENGTH = 500
MAX_AMOUNT = Decimal("9999999999999.99")


class TransactionRow(BaseModel):
    """A single pre-parsed transaction row from the frontend."""

    model_config = ConfigDict(str_strip_whitespace=True, allow_inf_nan=False)

    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="Calendar date, YYYY-MM-DD")
    amount: Decimal = Field(..., ge=0, le=MAX_AMOUNT, description="Transaction amount in INR")
    currency: str = Field("INR", max_length=10, description="Source accounting currency; INR only")
    type: str = Field(..., min_length=1, max_length=20)
    account: str = Field(..., min_length=1, max_length=MAX_LABEL_LENGTH)
    category: str = Field(..., min_length=1, max_length=MAX_LABEL_LENGTH)
    subcategory: str | None = Field(None, max_length=MAX_LABEL_LENGTH)
    note: str | None = Field(None, max_length=MAX_NOTE_LENGTH)

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: str) -> str:
        """Reject impossible calendar dates before reconciliation."""
        date.fromisoformat(value)
        return value

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, value: str) -> str:
        if value.upper() != "INR":
            msg = "Only INR source amounts are supported. Export or convert the source to INR."
            raise ValueError(msg)
        return "INR"

    @field_validator("type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        if value.lower() not in {
            "income",
            "expense",
            "expenses",
            "exp.",
            "transfer",
            "transfer-in",
            "transfer in",
            "transfer-out",
            "transfer out",
        }:
            msg = "Expected Income, Expense, Transfer-In, or Transfer-Out."
            raise ValueError(msg)
        return value


class TransactionUploadRequest(BaseModel):
    """Complete INR snapshot replacing all of the current user's ledger."""

    model_config = ConfigDict(str_strip_whitespace=True)

    file_name: str = Field(..., min_length=1, max_length=MAX_FILE_NAME_LENGTH)
    file_hash: str = Field(
        ..., pattern=r"^[a-fA-F0-9]{64}$", description="SHA-256 hex hash of raw file"
    )
    rows: list[TransactionRow] = Field(
        ...,
        min_length=1,
        max_length=MAX_UPLOAD_ROWS,
        description=(
            "All accounts and history to retain. Entries absent from this snapshot are removed."
        ),
    )
    force: bool = Field(False, description="Force re-import even if file was previously imported")
