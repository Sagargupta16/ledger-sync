"""Pydantic schemas for salary structure, RSU grants, and growth assumptions."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator


class SalaryComponents(BaseModel):
    """Compensation breakdown for a single fiscal year."""

    base_salary_annual: Decimal = Decimal(0)
    hra_annual: Decimal | None = None
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
    quantity: int = Field(gt=0, description="Shares that vested, BEFORE any tax withholding.")
    price_at_vest: Decimal | None = Field(
        default=None,
        gt=0,
        description="Stock price on the vest date, locked in once the vesting has passed.",
    )
    net_quantity: Decimal | None = Field(
        default=None,
        gt=0,
        description=(
            "Shares actually received after sell-to-cover withholding, when the "
            "employer withheld some of the vest to pay tax. Reporting only: "
            "perquisite value is taxed on the FULL vest, so `quantity` remains "
            "the basis for every tax projection. Fractional because brokers "
            "credit fractional residuals."
        ),
    )

    @model_validator(mode="after")
    def _net_cannot_exceed_gross(self) -> RsuVesting:
        """Reject a net quantity above the gross vest.

        Withholding only ever reduces the share count, so net > gross means the
        two fields were transposed. Left unchecked it would render a "received"
        line larger than the vest it came from.
        """
        if self.net_quantity is not None and self.net_quantity > self.quantity:
            msg = f"net_quantity ({self.net_quantity}) cannot exceed quantity ({self.quantity})"
            raise ValueError(msg)
        return self


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
