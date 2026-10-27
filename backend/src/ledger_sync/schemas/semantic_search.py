"""Pydantic schemas for the semantic transaction search endpoints."""

from typing import Literal

from pydantic import BaseModel, Field

from ledger_sync.schemas.transactions import TransactionResponse

#: Why semantic search cannot call Bedrock for this user right now.
UnavailableReason = Literal["server_not_configured", "personal_key_missing", "provider_not_bedrock"]


class SemanticSearchStatus(BaseModel):
    """Whether Bedrock is usable for this user, and how much of the ledger is indexed."""

    available: bool
    reason: UnavailableReason | None = None
    message: str | None = None
    #: ``app`` spends the server's Bedrock credentials, ``personal`` the user's own key.
    funding: Literal["app", "personal"] | None = None
    model: str
    dimensions: int
    region: str
    #: Live rows the Transactions page lists (excluded accounts left out).
    total: int = Field(..., ge=0)
    #: Rows whose vector matches their current text.
    indexed: int = Field(..., ge=0)
    #: Rows with no vector yet, or whose note, category or account changed.
    pending: int = Field(..., ge=0)
    batch_size: int = Field(..., ge=1)
    #: App-funded embedding tokens allowed per UTC day; None when no cap applies.
    daily_token_limit: int | None = None
    #: App-funded embedding tokens used or reserved since midnight UTC.
    tokens_today: int = Field(..., ge=0)


class SemanticIndexBatch(BaseModel):
    """Progress after one POST /index call; call again until ``done``."""

    embedded: int = Field(..., ge=0)
    failed: int = Field(..., ge=0)
    total: int = Field(..., ge=0)
    indexed: int = Field(..., ge=0)
    pending: int = Field(..., ge=0)
    done: bool
    input_tokens: int = Field(..., ge=0)
    cost_usd: float = Field(..., ge=0)
    #: Set when some rows of this batch failed and stay pending.
    error: str | None = None


class SemanticSearchResult(BaseModel):
    transaction: TransactionResponse
    #: Cosine similarity of the row's text to the query, -1 to 1 (higher is closer).
    score: float


class SemanticSearchResponse(BaseModel):
    query: str
    results: list[SemanticSearchResult]
    #: Live rows that have a vector; 0 means nothing was searched.
    indexed: int = Field(..., ge=0)
    model: str


class SemanticIndexDeleted(BaseModel):
    deleted: int = Field(..., ge=0)
