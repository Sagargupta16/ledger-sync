"""Pydantic schemas for the category suggestion endpoints."""

from pydantic import BaseModel, Field

from ledger_sync.schemas.upload import TransactionRow

#: Unsaved rows scored per POST; the upload review sends only placeholder-label rows.
MAX_SUGGESTION_ROWS = 2_000


class CategorySuggestionResponse(BaseModel):
    """One suggested label; confidence is the model's probability, 0 to 1."""

    category: str
    subcategory: str | None
    confidence: float = Field(..., ge=0, le=1)


class CategorySuggestionRowsRequest(BaseModel):
    """Unsaved upload rows, validated like the upload itself."""

    rows: list[TransactionRow] = Field(..., min_length=1, max_length=MAX_SUGGESTION_ROWS)


class RowCategorySuggestionsResponse(BaseModel):
    """Suggestions per request row, in request order; an empty list means abstain."""

    ready: bool
    suggestions: list[list[CategorySuggestionResponse]]
    rule_matched: int = Field(
        ...,
        ge=0,
        description="Rows an active categorization rule recategorizes on import; they get []",
    )


class CategorySuggestionStatusResponse(BaseModel):
    """Whether the user's model is on, with the thresholds it uses."""

    ready: bool
    training_rows: int
    category_count: int = Field(
        ..., description="Most categories within one type, income or expense"
    )
    min_training_rows: int
    min_categories: int
    confidence_floor: float
    placeholder_labels: list[str] = Field(
        ..., description="Casefolded labels that count as not categorised"
    )
