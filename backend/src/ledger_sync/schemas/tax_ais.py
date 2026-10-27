"""Request and response bodies for the per-tax-year AIS totals."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

# Rs 1 lakh crore. No individual's AIS reaches it; this only rejects absurd input.
AisAmount = Annotated[Decimal, Field(ge=0, le=Decimal(10**12), max_digits=15, decimal_places=2)]


def _consecutive_years(value: str) -> str:
    start, end = value.split("-")
    if (int(start) + 1) % 100 != int(end):
        msg = "A tax year spans two consecutive years, such as 2025-26."
        raise ValueError(msg)
    return value


# "2025-26": April 2025 to March 2026, the year an AIS covers.
TaxYear = Annotated[str, Field(pattern=r"^20\d{2}-\d{2}$"), AfterValidator(_consecutive_years)]


class TaxAisSummaryUpdate(BaseModel):
    """The four totals the browser computed from one decrypted AIS, in INR.

    Nothing else from the statement is accepted: no PAN, no row, no payer name.
    """

    model_config = ConfigDict(extra="forbid")

    tds_salary: AisAmount
    tds_other: AisAmount
    interest: AisAmount
    dividends: AisAmount


class TaxAisSummaryResponse(BaseModel):
    """The totals saved for one tax year."""

    tax_year: str
    tds_salary: float
    tds_other: float
    interest: float
    dividends: float
    # Last import in ISO 8601 UTC.
    updated_at: str


class TaxAisSummaryList(BaseModel):
    """Every saved tax year, newest first."""

    summaries: list[TaxAisSummaryResponse]
