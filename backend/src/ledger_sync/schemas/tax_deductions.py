"""Request and response bodies for old-regime deductions saved per tax year."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

# The inputs on /tax, keyed by the 1961 Act section names the page has always
# used. The page maps them to Income-tax Act 2025 numbers for display.
DeductionSection = Literal["80C", "80CCD(1B)", "80D", "HRA", "24(b)"]

# Far above every statutory cap; this only rejects absurd input.
DeductionAmount = Annotated[
    Decimal, Field(ge=0, le=Decimal(10_000_000), max_digits=15, decimal_places=2)
]


def _consecutive_years(value: str) -> str:
    start, end = value.split("-")
    if (int(start) + 1) % 100 != int(end):
        msg = "A tax year spans two consecutive years, such as 2026-27."
        raise ValueError(msg)
    return value


# "2026-27": April 2026 to March 2027. [0-9], not \d: Pydantic's regex engine
# matches any Unicode digit for \d, which would store look-alike year keys.
TaxYear = Annotated[
    str, Field(pattern=r"^20[0-9]{2}-[0-9]{2}$"), AfterValidator(_consecutive_years)
]


class TaxDeductionsUpdate(BaseModel):
    """The sections to change: a positive amount is stored, zero removes the section.

    A section left out keeps its saved amount.
    """

    model_config = ConfigDict(extra="forbid")

    deductions: dict[DeductionSection, DeductionAmount] = Field(default_factory=dict)


class TaxDeductionsResponse(BaseModel):
    """Every amount saved for one tax year, keyed by section."""

    tax_year: str
    deductions: dict[str, float]
