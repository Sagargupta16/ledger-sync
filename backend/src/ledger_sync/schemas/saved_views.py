"""Pydantic schemas for saved filter view API requests and responses."""

from typing import Any

from pydantic import BaseModel, Field


class SavedViewCreateRequest(BaseModel):
    """Request schema for creating (or upserting by name) a saved filter view."""

    name: str = Field(..., min_length=1, max_length=100, description="View name (unique per user)")
    filters: dict[str, Any] = Field(
        default_factory=dict, description="Opaque frontend filter state"
    )


class SavedViewResponse(BaseModel):
    """Single saved filter view response model."""

    id: int
    name: str
    filters: dict[str, Any]
    created_at: str
    updated_at: str
