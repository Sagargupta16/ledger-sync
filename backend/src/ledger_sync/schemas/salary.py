"""Pydantic schemas for salary structure, RSU grants, and growth assumptions."""

from __future__ import annotations

import re
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _exact_storage_decimal(value: Decimal | None) -> Decimal | None:
    """Reject only values outside unscaled PostgreSQL NUMERIC's exact capacity."""
    if value is not None and (
        not value.is_finite()
        or int(value.as_tuple().exponent) < -16383
        or value.adjusted() >= 131072
    ):
        raise ValueError("Decimal exceeds exact compensation storage limits.")
    return value


def _storage_text(value: str | None) -> str | None:
    if value is not None and "\x00" in value:
        raise ValueError("Compensation text cannot contain a NUL character.")
    return value


class SalaryComponents(BaseModel):
    """Compensation breakdown for a single fiscal year."""

    model_config = ConfigDict(extra="forbid")

    base_salary_annual: Decimal = Decimal(0)
    hra_annual: Decimal | None = None
    bonus_annual: Decimal = Decimal(0)
    epf_monthly: Decimal = Field(
        default=Decimal(3600),
        description="Employee EPF cash deduction; not a new-regime taxable-income deduction.",
    )
    nps_monthly: Decimal = Decimal(0)
    special_allowance_annual: Decimal = Decimal(0)
    other_taxable_annual: Decimal = Decimal(0)

    @field_validator("*")
    @classmethod
    def _exact_decimals(cls, value: Decimal | None) -> Decimal | None:
        return _exact_storage_decimal(value)


class SalaryStructureConfig(BaseModel):
    """Update payload for salary structure (keyed by FY string)."""

    salary_structure: dict[str, SalaryComponents]

    @field_validator("salary_structure")
    @classmethod
    def _valid_fiscal_years(cls, value: dict[str, SalaryComponents]) -> dict[str, SalaryComponents]:
        for fiscal_year in value:
            if (
                not re.fullmatch(r"[0-9]{4}-[0-9]{2}", fiscal_year)
                or int(fiscal_year[-2:]) != (int(fiscal_year[:4]) + 1) % 100
            ):
                raise ValueError("Fiscal year must be YYYY-YY for consecutive years.")
        return value


class RsuVesting(BaseModel):
    """A single vesting event within an RSU grant."""

    model_config = ConfigDict(extra="forbid")

    id: str | None = Field(
        default=None,
        min_length=1,
        description="Stable event ID returned by storage; omit for a new vesting.",
    )
    date: date
    quantity: int = Field(
        gt=0, le=2147483647, description="Shares that vested, BEFORE any tax withholding."
    )
    price_at_vest: Decimal | None = Field(
        default=None,
        gt=0,
        description="Stock price on the vest date, locked in once the vesting has passed.",
    )
    net_quantity: Decimal | None = Field(
        default=None,
        ge=0,
        description=(
            "Shares actually received after sell-to-cover withholding, when the "
            "employer withheld some of the vest to pay tax. Reporting only: "
            "perquisite value is taxed on the FULL vest, so `quantity` remains "
            "the basis for every tax projection. Fractional because brokers "
            "credit fractional residuals. Zero records full withholding; null "
            "leaves the actual quantity unknown so the UI can show an estimate."
        ),
    )

    @field_validator("quantity", mode="before")
    @classmethod
    def _quantity_is_not_boolean(cls, value: object) -> object:
        if isinstance(value, bool):
            raise ValueError("Vesting quantity must be an integer share count, not a boolean.")
        return value

    @field_validator("price_at_vest", "net_quantity")
    @classmethod
    def _exact_decimals(cls, value: Decimal | None) -> Decimal | None:
        return _exact_storage_decimal(value)

    @field_validator("id")
    @classmethod
    def _valid_text(cls, value: str | None) -> str | None:
        return _storage_text(value)

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

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    stock_name: str = Field(min_length=1)
    stock_price: Decimal = Field(gt=0)
    grant_date: date | None = None
    notes: str | None = None
    vestings: list[RsuVesting] = Field(min_length=1)

    @field_validator("stock_price")
    @classmethod
    def _exact_price(cls, value: Decimal) -> Decimal:
        _exact_storage_decimal(value)
        return value

    @field_validator("id", "stock_name", "notes")
    @classmethod
    def _valid_text(cls, value: str | None) -> str | None:
        return _storage_text(value)


class RsuGrantsConfig(BaseModel):
    """Update payload for RSU grants."""

    rsu_grants: list[RsuGrant]

    @model_validator(mode="after")
    def _unique_public_ids(self) -> RsuGrantsConfig:
        grant_ids = [grant.id for grant in self.rsu_grants]
        if len(grant_ids) != len(set(grant_ids)):
            raise ValueError("RSU grant IDs must be unique within a user.")
        event_ids = [
            vesting.id
            for grant in self.rsu_grants
            for vesting in grant.vestings
            if vesting.id is not None
        ]
        if len(event_ids) != len(set(event_ids)):
            raise ValueError("RSU vesting IDs must not be repeated.")
        return self


class GrowthAssumptions(BaseModel):
    """Growth parameters for multi-year tax projections."""

    base_salary_growth_pct: float = 0
    bonus_growth_pct: float = 0
    bonus_mode: Literal["recurring", "one_time"] | None = Field(
        default=None,
        description=(
            "Bonus recurrence in projected years. Null keeps the saved behavior: "
            "zero growth is one-time, nonzero growth repeats."
        ),
    )
    epf_scales_with_base: bool = True
    nps_growth_pct: float = 0
    stock_price_appreciation_pct: float = 0
    projection_years: int = Field(default=3, ge=1, le=5)


class GrowthAssumptionsConfig(BaseModel):
    """Update payload for growth assumptions."""

    growth_assumptions: GrowthAssumptions
