"""Responses for the CAS import and the mutual-fund holdings it creates."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from ledger_sync.core.mf_valuation import XirrNote


class CasImportResponse(BaseModel):
    """What one statement replaced. The PDF and its password were not kept."""

    source: str = Field(description="CAMS, KFINTECH, NSDL or CDSL")
    cas_type: str | None = Field(description="DETAILED or SUMMARY; null for NSDL/CDSL")
    statement_from: date | None
    statement_to: date | None
    folios: int
    schemes: int = Field(description="Every scheme stored, fully redeemed ones included")
    holdings: int = Field(description="Schemes with units left")
    transactions: int
    replaced: int = Field(description="Holdings from the previous import of this kind removed")
    warnings: list[str] = Field(
        description="What the parser flagged, if anything: a scheme it skipped, or rows that "
        "do not add up to the unit balance"
    )


class MfHoldingResponse(BaseModel):
    id: int
    source: str
    folio: str | None
    amc: str | None
    scheme_name: str
    isin: str | None
    amfi_code: str | None
    scheme_type: str | None
    units: float
    nav: float | None
    nav_date: date | None
    nav_source: Literal["amfi", "statement"] | None
    current_value: float | None
    cost: float | None
    gain: float | None
    gain_pct: float | None
    xirr: float | None = Field(description="Annualised percent on a 365-day year")
    xirr_since: date | None = Field(description="Date of the first cash flow")
    xirr_note: XirrNote | None


class MfHoldingsSummary(BaseModel):
    current_value: float
    cost: float | None
    gain: float | None
    gain_pct: float | None
    xirr: float | None = Field(description="Over every scheme with a complete history")
    xirr_since: date | None
    xirr_schemes: int
    holdings: int
    closed: int = Field(description="Fully redeemed schemes in the statement")
    cost_schemes: int = Field(description="Held schemes that Cost and Gain cover (value and cost)")
    unpriced_schemes: int = Field(description="Held schemes with no NAV, so no value")


class MfNavStatus(BaseModel):
    """How fresh the AMFI NAVs behind this response are."""

    checked_at: datetime | None = Field(description="Newest AMFI check of these schemes, UTC")
    newest_nav_date: date | None
    stale: bool = Field(description="True when today's refresh failed or was skipped")
    message: str | None


class MfImportInfo(BaseModel):
    source: str
    cas_type: str | None
    statement_from: date | None
    statement_to: date | None
    imported_at: datetime
    schemes: int


class MfHoldingsResponse(BaseModel):
    holdings: list[MfHoldingResponse]
    summary: MfHoldingsSummary
    nav: MfNavStatus
    imports: list[MfImportInfo]
