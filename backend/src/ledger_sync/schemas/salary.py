"""Pydantic schemas for salary structure, RSU grants, and growth assumptions."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field


class SalaryComponents(BaseModel):
    """Compensation breakdown for a single fiscal year."""

    base_salary_monthly: Decimal = Decimal(0)
    hra_monthly: Decimal | None = None
    bonus_annual: Decimal = Decimal(0)
    epf_monthly: Decimal = Decimal(3600)
    nps_monthly: Decimal = Decimal(0)
    special_allowance_annual: Decimal = Decimal(0)
    other_taxable_annual: Decimal = Decimal(0)


class SalaryStructureConfig(BaseModel):
    """Update payload for salary structure (keyed by FY string)."""

    salary_structure: dict[str, SalaryComponents]


class RsuVesting(BaseModel):
    """A single vesting event within an RSU grant."""

    date: date
    quantity: int = Field(gt=0)


class RsuGrant(BaseModel):
    """An RSU grant with its vesting schedule."""

    id: str
    stock_name: str = Field(min_length=1)
    stock_price: Decimal = Field(gt=0)
    grant_date: date | None = None
    notes: str | None = None
    vestings: list[RsuVesting] = Field(min_length=1)


class RsuGrantsConfig(BaseModel):
    """Update payload for RSU grants."""

    rsu_grants: list[RsuGrant]


class GrowthAssumptions(BaseModel):
    """Growth parameters for multi-year tax projections."""

    base_salary_growth_pct: float = 0
    bonus_growth_pct: float = 0
    epf_scales_with_base: bool = True
    nps_growth_pct: float = 0
    stock_price_appreciation_pct: float = 0
    projection_years: int = Field(default=3, ge=1, le=5)


class GrowthAssumptionsConfig(BaseModel):
    """Update payload for growth assumptions."""

    growth_assumptions: GrowthAssumptions
