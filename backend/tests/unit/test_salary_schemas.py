"""Tests for salary, RSU, and growth assumption schemas."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from ledger_sync.schemas.salary import (
    GrowthAssumptions,
    GrowthAssumptionsConfig,
    RsuGrant,
    RsuGrantsConfig,
    RsuVesting,
    SalaryComponents,
    SalaryStructureConfig,
)


class TestSalaryComponents:
    def test_defaults(self):
        comp = SalaryComponents()
        assert comp.base_salary_monthly == Decimal(0)
        assert comp.hra_monthly is None
        assert comp.bonus_annual == Decimal(0)
        assert comp.epf_monthly == Decimal(3600)
        assert comp.nps_monthly == Decimal(0)

    def test_custom_values(self):
        comp = SalaryComponents(
            base_salary_monthly=Decimal("80000"),
            hra_monthly=Decimal("32000"),
            bonus_annual=Decimal("200000"),
        )
        assert comp.base_salary_monthly == Decimal("80000")
        assert comp.hra_monthly == Decimal("32000")

    def test_salary_structure_config(self):
        config = SalaryStructureConfig(
            salary_structure={
                "2025-26": SalaryComponents(base_salary_monthly=Decimal("80000")),
            }
        )
        assert "2025-26" in config.salary_structure
        assert config.salary_structure["2025-26"].base_salary_monthly == Decimal("80000")


class TestRsuGrant:
    def test_valid_grant(self):
        grant = RsuGrant(
            id="grant-1",
            stock_name="AMZN",
            stock_price=Decimal("185.50"),
            vestings=[RsuVesting(date=date(2026, 3, 15), quantity=25)],
        )
        assert grant.stock_name == "AMZN"
        assert len(grant.vestings) == 1
        assert grant.vestings[0].quantity == 25

    def test_grant_requires_at_least_one_vesting(self):
        with pytest.raises(ValidationError):
            RsuGrant(
                id="grant-1",
                stock_name="AMZN",
                stock_price=Decimal("185.50"),
                vestings=[],
            )

    def test_vesting_quantity_must_be_positive(self):
        with pytest.raises(ValidationError):
            RsuVesting(date=date(2026, 3, 15), quantity=0)

    def test_stock_price_must_be_positive(self):
        with pytest.raises(ValidationError):
            RsuGrant(
                id="grant-1",
                stock_name="AMZN",
                stock_price=Decimal("0"),
                vestings=[RsuVesting(date=date(2026, 3, 15), quantity=25)],
            )

    def test_stock_name_must_be_nonempty(self):
        with pytest.raises(ValidationError):
            RsuGrant(
                id="grant-1",
                stock_name="",
                stock_price=Decimal("100"),
                vestings=[RsuVesting(date=date(2026, 3, 15), quantity=25)],
            )

    def test_optional_fields(self):
        grant = RsuGrant(
            id="grant-1",
            stock_name="GOOG",
            stock_price=Decimal("150"),
            grant_date=date(2025, 1, 1),
            notes="Joining grant",
            vestings=[RsuVesting(date=date(2026, 1, 1), quantity=10)],
        )
        assert grant.grant_date == date(2025, 1, 1)
        assert grant.notes == "Joining grant"

    def test_rsu_grants_config(self):
        config = RsuGrantsConfig(
            rsu_grants=[
                RsuGrant(
                    id="g1",
                    stock_name="AMZN",
                    stock_price=Decimal("185"),
                    vestings=[RsuVesting(date=date(2026, 3, 15), quantity=25)],
                )
            ]
        )
        assert len(config.rsu_grants) == 1


class TestGrowthAssumptions:
    def test_defaults(self):
        ga = GrowthAssumptions()
        assert ga.base_salary_growth_pct == 0
        assert ga.bonus_growth_pct == 0
        assert ga.epf_scales_with_base is True
        assert ga.nps_growth_pct == 0
        assert ga.stock_price_appreciation_pct == 0
        assert ga.projection_years == 3

    def test_projection_years_bounds(self):
        ga = GrowthAssumptions(projection_years=5)
        assert ga.projection_years == 5

        with pytest.raises(ValidationError):
            GrowthAssumptions(projection_years=0)

        with pytest.raises(ValidationError):
            GrowthAssumptions(projection_years=6)

    def test_growth_assumptions_config(self):
        config = GrowthAssumptionsConfig(
            growth_assumptions=GrowthAssumptions(
                base_salary_growth_pct=10,
                projection_years=4,
            )
        )
        assert config.growth_assumptions.base_salary_growth_pct == 10
