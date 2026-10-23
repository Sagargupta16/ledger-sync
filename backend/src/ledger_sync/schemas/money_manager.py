"""Response models for Money Manager backup uploads and upload tokens."""

from typing import Literal

from pydantic import BaseModel, Field


class BackupSummary(BaseModel):
    """What one backup holds, before any comparison with the stored ledger."""

    transactions: int
    transfers: int
    accounts: int
    first_date: str | None
    last_date: str | None


class MoneyManagerUploadResponse(BaseModel):
    """Result of a backup upload.

    ``preview`` is a dry run: the stats are what an import would change, and
    nothing was committed. ``unchanged`` means this exact backup was already
    imported. Error responses carry ``detail`` instead of ``status``, which an
    automation can test for.
    """

    status: Literal["imported", "unchanged", "preview"]
    file_name: str
    stats: dict[str, int]
    summary: BackupSummary
    analytics_status: Literal["ready", "failed", "skipped"]
    analytics_message: str | None = None


class UploadTokenCreate(BaseModel):
    """Name a new upload token so it can be told apart and revoked later."""

    name: str = Field(min_length=1, max_length=100)


class UploadTokenEntry(BaseModel):
    """An active token, without its secret. Times are UTC ISO-8601."""

    id: int
    name: str
    prefix: str
    created_at: str
    expires_at: str
    last_used_at: str | None


class UploadTokenCreated(UploadTokenEntry):
    """The new token; ``token`` is the only time its plaintext is returned."""

    token: str


class UploadTokenList(BaseModel):
    tokens: list[UploadTokenEntry]
