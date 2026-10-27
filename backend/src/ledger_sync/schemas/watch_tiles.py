"""Pydantic schemas for the Dashboard watch tiles (saved views pinned to it)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

#: Most saved views one user can pin. Each tile costs one aggregate query.
MAX_PINS = 8

#: What a tile sums: the type its view filters to, or spending when it has none.
WatchMeasure = Literal["expense", "income", "transfer"]


class WatchTrendPoint(BaseModel):
    """One complete month of a tile's trend."""

    month: str = Field(..., description="YYYY-MM")
    amount: float


class WatchTile(BaseModel):
    """A pinned view's month-to-date total and its comparisons."""

    view_id: int
    name: str
    position: int
    measure: WatchMeasure
    filters_valid: bool = Field(
        ..., description="False when the stored filters fail validation; the sums are then 0"
    )
    has_date_range: bool = Field(
        ..., description="The view carries its own date bounds, which narrow every window"
    )
    other_types_present: bool = Field(
        ...,
        description=(
            "The view has no type filter and also lists income or transfer rows in these"
            " months, which the tile leaves out: it counts the expense rows only"
        ),
    )
    month_to_date: float
    previous_same_period: float = Field(
        ..., description="The same days of last month, clamped to its length"
    )
    change_pct: float | None = Field(
        ..., description="Percent change against previous_same_period; null when that is 0"
    )
    transaction_count: int = Field(..., description="Rows summed into month_to_date")
    trend: list[WatchTrendPoint] = Field(..., description="Complete months, oldest first")


class WatchSuggestion(BaseModel):
    """A category offered as a one-tap pin while nothing is pinned."""

    category: str
    amount: float
    transaction_count: int


class WatchPeriod(BaseModel):
    """The IST calendar windows every tile in the response uses."""

    today: str
    month_start: str
    previous_start: str
    previous_end: str
    trend_months: list[str]


class WatchTilesResponse(BaseModel):
    """Every pinned tile in order, or suggestions when there are none."""

    period: WatchPeriod
    tiles: list[WatchTile]
    suggestions: list[WatchSuggestion]
    suggestions_month: str | None = Field(..., description="YYYY-MM the suggestions rank")
    max_pins: int


class WatchPin(BaseModel):
    """One pin and its place in the tile order."""

    view_id: int
    position: int


class WatchPinOrderRequest(BaseModel):
    """Pinned view ids in their new order; pins left out keep their order after them."""

    view_ids: list[int] = Field(..., max_length=50)

    @field_validator("view_ids")
    @classmethod
    def _no_repeats(cls, value: list[int]) -> list[int]:
        if len(set(value)) != len(value):
            raise ValueError("view_ids must not repeat")
        return value


class WatchCategoryPinRequest(BaseModel):
    """Pin one category's spending: a suggestion tapped on the Dashboard."""

    category: str = Field(..., min_length=1, max_length=255)

    @field_validator("category")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        # Kept unstripped: the view filters by equality with the ledger value.
        if not value.strip():
            raise ValueError("category must not be blank")
        return value


class WatchCategoryPinResponse(BaseModel):
    """The saved view the category pin uses (reused or created) and its pin."""

    view_id: int
    name: str
    position: int
