"""Pydantic schemas for saved filter view API requests and responses."""

import json
from typing import Any

from pydantic import BaseModel, Field, field_validator

# Filter state is a handful of short values; the bounds only stop a runaway body
# from being stored.
MAX_FILTERS_JSON_LENGTH = 32_768
MAX_SAVED_VIEWS = 100


class SavedViewCreateRequest(BaseModel):
    """Request schema for creating (or upserting by name) a saved filter view."""

    name: str = Field(..., min_length=1, max_length=100, description="View name (unique per user)")
    filters: dict[str, Any] = Field(
        default_factory=dict, description="Opaque frontend filter state"
    )

    @field_validator("name")
    @classmethod
    def _no_nul(cls, value: str) -> str:
        if "\x00" in value:
            msg = "Text cannot contain a NUL character."
            raise ValueError(msg)
        return value

    @field_validator("filters")
    @classmethod
    def _storable_filters(cls, value: dict[str, Any]) -> dict[str, Any]:
        try:
            text = json.dumps(value, allow_nan=False)
        except ValueError as error:
            msg = "Filters cannot contain NaN or Infinity."
            raise ValueError(msg) from error
        if len(text) > MAX_FILTERS_JSON_LENGTH:
            msg = f"Filters are larger than {MAX_FILTERS_JSON_LENGTH} characters of JSON."
            raise ValueError(msg)
        return value


class SavedViewResponse(BaseModel):
    """Single saved filter view response model."""

    id: int
    name: str
    filters: dict[str, Any]
    created_at: str
    updated_at: str
