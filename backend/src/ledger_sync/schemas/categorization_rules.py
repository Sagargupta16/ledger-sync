"""Pydantic schemas for categorization rule API requests and responses."""

from pydantic import BaseModel, Field


class CategorizationRuleCreateRequest(BaseModel):
    """Request schema for creating a categorization rule."""

    match_field: str = Field(
        "note",
        pattern="^(note|account)$",
        description="Transaction field the pattern is matched against",
    )
    pattern: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Case-insensitive substring to match",
    )
    category: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Category to set on match",
    )
    subcategory: str | None = Field(
        None,
        max_length=255,
        description="Subcategory to set on match (null clears it)",
    )
    is_active: bool = Field(True, description="Whether the rule participates in matching")
    sort_order: int = Field(0, ge=0, description="Evaluation order (lower runs first)")


class CategorizationRuleUpdateRequest(BaseModel):
    """Request schema for fully replacing a categorization rule (not a partial PATCH)."""

    match_field: str = Field(
        "note",
        pattern="^(note|account)$",
        description="Transaction field the pattern is matched against",
    )
    pattern: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Case-insensitive substring to match",
    )
    category: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Category to set on match",
    )
    subcategory: str | None = Field(
        None,
        max_length=255,
        description="Subcategory to set on match (null clears it)",
    )
    is_active: bool = Field(True, description="Whether the rule participates in matching")
    sort_order: int = Field(0, ge=0, description="Evaluation order (lower runs first)")


class CategorizationRuleResponse(BaseModel):
    """Single categorization rule response model."""

    id: int
    match_field: str
    pattern: str
    category: str
    subcategory: str
    is_active: bool
    sort_order: int
    created_at: str


class RulesApplyResponse(BaseModel):
    """Response for the retroactive rule application endpoint."""

    matched: int
    updated: int
    analytics_refreshed: bool
