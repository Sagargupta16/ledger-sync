"""Validated tool arguments and the provider-visible schemas generated from them."""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal, Self

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator


def _calendar_date(value: str) -> str:
    parsed = date.fromisoformat(value)
    if parsed == date.max:
        raise ValueError("Date must allow an inclusive end-of-day boundary")
    return value


DateString = Annotated[
    str,
    Field(min_length=10, max_length=10, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    AfterValidator(_calendar_date),
]
Label = Annotated[str, Field(min_length=1, max_length=200)]
Amount = Annotated[float, Field(ge=0, le=9_999_999_999_999.99, allow_inf_nan=False)]


class ToolArguments(BaseModel):
    """Reject unknown fields and implicit conversions such as strings to booleans."""

    model_config = ConfigDict(
        extra="forbid", strict=True, str_strip_whitespace=True, allow_inf_nan=False
    )


class DateRangeArguments(ToolArguments):
    start_date: DateString | None = None
    end_date: DateString | None = None

    @model_validator(mode="after")
    def validate_range(self) -> Self:
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date must not be after end_date")
        return self


class SearchTransactionsArguments(DateRangeArguments):
    query: str = Field(default="", max_length=500)
    category: Label | None = None
    account: Label | None = None
    type: Literal["Income", "Expense", "Transfer"] | None = None
    min_amount: Amount | None = None
    max_amount: Amount | None = None
    limit: int = Field(default=20, ge=1, le=100)

    @model_validator(mode="after")
    def validate_amount_range(self) -> Self:
        if (
            self.min_amount is not None
            and self.max_amount is not None
            and self.min_amount > self.max_amount
        ):
            raise ValueError("min_amount must not exceed max_amount")
        return self


class MonthlySummaryArguments(ToolArguments):
    period: str = Field(min_length=7, max_length=7, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")

    @model_validator(mode="after")
    def validate_period(self) -> Self:
        date.fromisoformat(f"{self.period}-01")
        return self


class ListCategoriesArguments(DateRangeArguments):
    type: Literal["Income", "Expense"] = "Expense"
    limit: int = Field(default=15, ge=1, le=50)


class CategorySpendingArguments(DateRangeArguments):
    category: Label


class RecurringArguments(ToolArguments):
    active_only: bool = True


class RecentMonthsArguments(ToolArguments):
    limit: int = Field(default=6, ge=1, le=24)


class FiscalYearArguments(ToolArguments):
    fiscal_year: str | None = Field(
        default=None, min_length=9, max_length=9, pattern=r"^FY\d{4}-\d{2}$"
    )

    @model_validator(mode="after")
    def validate_fiscal_year(self) -> Self:
        if self.fiscal_year:
            year = int(self.fiscal_year[2:6])
            if year < 1 or int(self.fiscal_year[7:]) != (year + 1) % 100:
                raise ValueError("fiscal_year must contain consecutive years, such as FY2024-25")
        return self


class CashFlowArguments(ToolArguments):
    months: int = Field(default=12, ge=1, le=60)


class AnomalyArguments(ToolArguments):
    include_reviewed: bool = False
