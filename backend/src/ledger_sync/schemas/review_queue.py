"""Request and response models for the transaction review queue."""

from typing import Literal, Self

from pydantic import BaseModel, Field, field_validator, model_validator

from ledger_sync.schemas.upload import MAX_LABEL_LENGTH

ReviewableType = Literal["Income", "Expense"]
Decision = Literal["keep", "change"]


class CategorySuggestion(BaseModel):
    """One category the suggester proposes for a row."""

    category: str
    subcategory: str | None = None
    # Between 0 and 1 when the suggester reports one.
    confidence: float | None = None


class ReviewItem(BaseModel):
    """One unreviewed row, with at most two suggestions other than its own label."""

    transaction_id: str
    date: str
    amount: float
    type: ReviewableType
    account: str
    category: str
    subcategory: str | None = None
    note: str | None = None
    suggestions: list[CategorySuggestion]


class CategoryOption(BaseModel):
    """A category used on live rows of one type, with its subcategories by use."""

    type: ReviewableType
    category: str
    subcategories: list[str]
    count: int


class ReviewQueueResponse(BaseModel):
    """The newest unreviewed rows of the window and the picker's options.

    ``remaining`` counts every unreviewed row in the window, ``items`` included;
    ``reviewed`` counts the window's rows that already carry a decision.
    """

    items: list[ReviewItem]
    remaining: int
    reviewed: int
    window_start: str | None
    window_days: int
    categories: list[CategoryOption]


class ReviewRequest(BaseModel):
    """Keep the row's category, or change it to ``category`` and ``subcategory``."""

    action: Decision
    category: str | None = Field(None, max_length=MAX_LABEL_LENGTH)
    subcategory: str | None = Field(None, max_length=MAX_LABEL_LENGTH)

    @field_validator("category", "subcategory", mode="before")
    @classmethod
    def _blank_is_none(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value

    @model_validator(mode="after")
    def _change_needs_category(self) -> Self:
        if self.action == "change" and self.category is None:
            raise ValueError("Choose the category to change to.")
        return self


class ReviewResponse(BaseModel):
    """The stored decision. ``imported_*`` is the label the import gives the row."""

    transaction_id: str
    decision: Decision
    category: str
    subcategory: str | None = None
    imported_category: str
    imported_subcategory: str | None = None
