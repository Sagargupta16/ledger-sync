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


class PlanningCounts(BaseModel):
    """How one kind of Money Manager setting compared with what is stored.

    ``found`` counts live items in the backup. ``kept`` items were edited in
    Ledger Sync since the last import and are left as edited. ``removed``
    items are gone from the backup (or no longer importable), so their rows
    were switched off. ``skipped`` counts items not imported, by reason.
    """

    found: int
    added: int
    updated: int
    unchanged: int
    kept: int
    removed: int
    skipped: dict[str, int]


class PlanningSummary(BaseModel):
    """Repeat rules (as scheduled transactions) and budgets. ``None``: no such tables."""

    repeat_rules: PlanningCounts | None
    budgets: PlanningCounts | None


class MoneyManagerUploadResponse(BaseModel):
    """Result of a backup upload.

    ``preview`` is a dry run: the stats are what an import would change, and
    nothing was committed. ``unchanged`` means this exact backup was already
    imported. Error responses carry ``detail`` instead of ``status``, which an
    automation can test for. ``planning`` is ``None`` when the backup has no
    repeat-rule or budget tables, for an ``unchanged`` backup, until the
    ``external_refs`` migration has run, and when they could not be compared
    or stored (the ledger imports regardless).
    """

    status: Literal["imported", "unchanged", "preview"]
    file_name: str
    stats: dict[str, int]
    summary: BackupSummary
    analytics_status: Literal["ready", "failed", "skipped"]
    analytics_message: str | None = None
    planning: PlanningSummary | None = None


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
