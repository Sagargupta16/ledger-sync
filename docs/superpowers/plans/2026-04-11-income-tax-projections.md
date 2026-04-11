# Income & Tax Projections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add salary structure input to Settings, RSU vesting schedule tracking, growth assumptions, and multi-year tax projections integrated into the existing Tax Planning page.

**Architecture:** Three new JSON columns in `user_preferences` store salary_structure (per-FY dict), rsu_grants (array with inline vestings), and growth_assumptions (single object). Three new PUT endpoints extend the preferences API. A new `projectionCalculator.ts` module provides pure functions that consume this data and produce per-FY tax breakdowns using the existing `calculateTax()` from `taxCalculator.ts`. The Tax Planning page extends its FY navigator into future years and renders projection data when salary structure is configured.

**Tech Stack:** Python 3.14 / FastAPI / SQLAlchemy 2.0 / Alembic (backend); React 19 / TypeScript / Zustand / TanStack Query / Recharts / Tailwind CSS 4 (frontend)

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `backend/src/ledger_sync/schemas/salary.py` | Pydantic models: SalaryComponents, RsuGrant, RsuVesting, GrowthAssumptions, config wrappers |
| `backend/alembic/versions/xxxx_add_salary_rsu_growth_fields.py` | Migration: 3 JSON columns on user_preferences |
| `backend/tests/unit/test_salary_schemas.py` | Pydantic validation tests |
| `frontend/src/types/salary.ts` | TypeScript interfaces for salary, RSU, growth |
| `frontend/src/lib/projectionCalculator.ts` | Pure projection functions: projectFiscalYear, projectMultipleYears, getRsuVestingsByFY |
| `frontend/src/lib/__tests__/projectionCalculator.test.ts` | Unit tests for projection logic |
| `frontend/src/pages/settings/SalaryStructureSection.tsx` | Settings UI: salary grid, RSU grant cards, growth assumptions |

### Modified Files

| File | Changes |
|------|---------|
| `backend/src/ledger_sync/db/models.py` | Add 3 columns to UserPreferences |
| `backend/src/ledger_sync/api/preferences.py` | Add 3 PUT endpoints, extend _model_to_response |
| `backend/src/ledger_sync/schemas/preferences.py` | Add 3 fields to UserPreferencesResponse and UserPreferencesUpdate |
| `frontend/src/services/api/preferences.ts` | Add 3 fields to UserPreferences interface, 3 config types, 3 service methods |
| `frontend/src/hooks/api/usePreferences.ts` | Add 3 mutation hooks |
| `frontend/src/store/preferencesStore.ts` | Add salary/rsu/growth state, actions, hydration, selectors |
| `frontend/src/pages/settings/useSettingsState.ts` | Include salary/rsu/growth in local state, save flow |
| `frontend/src/pages/SettingsPage.tsx` | Import and render SalaryStructureSection |
| `frontend/src/pages/TaxPlanningPage.tsx` | FY nav extension, projection toggle, multi-year table, insights |

---

## Parallelization Guide

Tasks are grouped into **3 independent tracks** that can run concurrently:

- **Track A (Backend):** Tasks 1 → 2 → 3 → 4 (sequential)
- **Track B (Frontend Infra):** Tasks 5 → 6 → 7 (sequential)
- **Track C (Projection Logic):** Task 8 → 9 (sequential, depends only on Task 5 for types)

After all tracks complete:
- **Task 10:** Settings UI (depends on Track B + Track C)
- **Task 11:** Tax Planning page enhancement (depends on all tracks)
- **Task 12:** Full integration verification

---

## Task 1: Backend — Pydantic Schemas for Salary, RSU, Growth

**Files:**
- Create: `backend/src/ledger_sync/schemas/salary.py`

- [ ] **Step 1: Create the salary schemas file**

```python
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
```

Write this file to `backend/src/ledger_sync/schemas/salary.py`.

- [ ] **Step 2: Verify import works**

Run: `cd backend && uv run python -c "from ledger_sync.schemas.salary import SalaryComponents, RsuGrant, GrowthAssumptions; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/src/ledger_sync/schemas/salary.py
git commit -m "feat: add Pydantic schemas for salary, RSU, and growth assumptions"
```

---

## Task 2: Backend — Database Model + Migration

**Files:**
- Modify: `backend/src/ledger_sync/db/models.py` (UserPreferences class)
- Create: `backend/alembic/versions/xxxx_add_salary_rsu_growth_fields.py`

- [ ] **Step 1: Add columns to UserPreferences model**

In `backend/src/ledger_sync/db/models.py`, find the UserPreferences class. Add these 3 columns after the existing `notify_days_ahead` field (before `created_at`):

```python
    # ── Salary & Tax Projections ──────────────────────────────────────────
    salary_structure: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    rsu_grants: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    growth_assumptions: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
```

Pattern matches existing JSON fields like `credit_card_limits` (stored as `Text`, parsed at API layer).

- [ ] **Step 2: Generate Alembic migration**

Run: `cd backend && uv run alembic revision --autogenerate -m "add salary structure, RSU grants, and growth assumptions"`

- [ ] **Step 3: Edit the migration — set empty downgrade**

Open the generated migration file. The `upgrade()` should contain 3 `op.add_column` calls. Set `downgrade()` to empty (consistent with project convention post-2026-02-03):

```python
def downgrade() -> None:
    pass
```

- [ ] **Step 4: Apply migration**

Run: `cd backend && uv run alembic upgrade head`
Expected: Migration applies successfully.

- [ ] **Step 5: Verify columns exist**

Run: `cd backend && uv run python -c "from ledger_sync.db.models import UserPreferences; print([c.name for c in UserPreferences.__table__.columns if 'salary' in c.name or 'rsu' in c.name or 'growth' in c.name])"`
Expected: `['salary_structure', 'rsu_grants', 'growth_assumptions']`

- [ ] **Step 6: Commit**

```bash
git add backend/src/ledger_sync/db/models.py backend/alembic/versions/
git commit -m "feat: add salary_structure, rsu_grants, growth_assumptions columns to user_preferences"
```

---

## Task 3: Backend — API Endpoints

**Files:**
- Modify: `backend/src/ledger_sync/api/preferences.py`
- Modify: `backend/src/ledger_sync/schemas/preferences.py`

- [ ] **Step 1: Extend UserPreferencesResponse in schemas/preferences.py**

Add these 3 fields to the `UserPreferencesResponse` class (after the existing `notify_days_ahead` field):

```python
    # Salary & Tax Projections
    salary_structure: dict[str, Any] = {}
    rsu_grants: list[dict[str, Any]] = []
    growth_assumptions: dict[str, Any] = {}
```

Ensure `from typing import Any` is already imported (it should be — verify).

Also add the same 3 fields to `UserPreferencesUpdate` (as optional):

```python
    salary_structure: dict[str, Any] | None = None
    rsu_grants: list[dict[str, Any]] | None = None
    growth_assumptions: dict[str, Any] | None = None
```

- [ ] **Step 2: Extend _model_to_response in api/preferences.py**

Add the import at top of preferences.py:

```python
from ledger_sync.schemas.salary import (
    GrowthAssumptionsConfig,
    RsuGrantsConfig,
    SalaryStructureConfig,
)
```

In the `_model_to_response()` function, add these 3 lines (alongside existing JSON field conversions like `credit_card_limits`):

```python
        salary_structure=_parse_json_field(prefs.salary_structure, {}),
        rsu_grants=_parse_json_field(prefs.rsu_grants, []),
        growth_assumptions=_parse_json_field(prefs.growth_assumptions, {}),
```

- [ ] **Step 3: Add 3 new PUT endpoints**

Add these endpoints to `backend/src/ledger_sync/api/preferences.py`, after the existing section endpoints (e.g., after `update_earning_start_date`):

```python
@router.put("/salary-structure")
def update_salary_structure(
    current_user: CurrentUser,
    config: SalaryStructureConfig,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Update salary structure for one or more fiscal years."""
    return _update_section(session, current_user, config, json_fields={"salary_structure"})


@router.put("/rsu-grants")
def update_rsu_grants(
    current_user: CurrentUser,
    config: RsuGrantsConfig,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Update RSU grants and vesting schedules."""
    return _update_section(session, current_user, config, json_fields={"rsu_grants"})


@router.put("/growth-assumptions")
def update_growth_assumptions(
    current_user: CurrentUser,
    config: GrowthAssumptionsConfig,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Update growth assumptions for tax projections."""
    return _update_section(session, current_user, config, json_fields={"growth_assumptions"})
```

- [ ] **Step 4: Verify endpoints register**

Run: `cd backend && uv run python -c "from ledger_sync.main import app; routes = [r.path for r in app.routes]; print([r for r in routes if 'salary' in r or 'rsu' in r or 'growth' in r])"`
Expected: List containing the 3 new endpoint paths.

- [ ] **Step 5: Run existing tests to ensure no regressions**

Run: `cd backend && uv run pytest tests/ -v`
Expected: All 38 existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/ledger_sync/api/preferences.py backend/src/ledger_sync/schemas/preferences.py
git commit -m "feat: add salary-structure, rsu-grants, growth-assumptions API endpoints"
```

---

## Task 4: Backend — Unit Tests for Schemas

**Files:**
- Create: `backend/tests/unit/test_salary_schemas.py`

- [ ] **Step 1: Write schema validation tests**

```python
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
```

Write this file to `backend/tests/unit/test_salary_schemas.py`.

- [ ] **Step 2: Run the tests**

Run: `cd backend && uv run pytest tests/unit/test_salary_schemas.py -v`
Expected: All tests pass.

- [ ] **Step 3: Run full backend test suite**

Run: `cd backend && uv run pytest tests/ -v`
Expected: All tests pass (38 existing + new schema tests).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/unit/test_salary_schemas.py
git commit -m "test: add unit tests for salary, RSU, and growth assumption schemas"
```

---

## Task 5: Frontend — TypeScript Types

**Files:**
- Create: `frontend/src/types/salary.ts`

- [ ] **Step 1: Create salary types file**

```typescript
/** Compensation breakdown for a single fiscal year. */
export interface SalaryComponents {
  base_salary_monthly: number
  hra_monthly: number | null
  bonus_annual: number
  epf_monthly: number
  nps_monthly: number
  special_allowance_annual: number
  other_taxable_annual: number
}

/** A single vesting event within an RSU grant. */
export interface RsuVesting {
  date: string // YYYY-MM-DD
  quantity: number
}

/** An RSU grant with its vesting schedule. */
export interface RsuGrant {
  id: string
  stock_name: string
  stock_price: number
  grant_date: string | null
  notes: string | null
  vestings: RsuVesting[]
}

/** Growth parameters for multi-year projections. */
export interface GrowthAssumptions {
  base_salary_growth_pct: number
  bonus_growth_pct: number
  epf_scales_with_base: boolean
  nps_growth_pct: number
  stock_price_appreciation_pct: number
  projection_years: number
}

/** Default salary components for a new FY entry. */
export const DEFAULT_SALARY_COMPONENTS: SalaryComponents = {
  base_salary_monthly: 0,
  hra_monthly: null,
  bonus_annual: 0,
  epf_monthly: 3600,
  nps_monthly: 0,
  special_allowance_annual: 0,
  other_taxable_annual: 0,
}

/** Default growth assumptions. */
export const DEFAULT_GROWTH_ASSUMPTIONS: GrowthAssumptions = {
  base_salary_growth_pct: 0,
  bonus_growth_pct: 0,
  epf_scales_with_base: true,
  nps_growth_pct: 0,
  stock_price_appreciation_pct: 0,
  projection_years: 3,
}

/** Projected breakdown for a single fiscal year. */
export interface ProjectedFYBreakdown {
  fy: string
  baseSalary: number
  hra: number
  bonus: number
  epf: number
  nps: number
  specialAllowance: number
  otherTaxable: number
  rsuIncome: number
  rsuDetails: Array<{ stock_name: string; shares: number; value: number }>
  grossTaxable: number
  standardDeduction: number
  netTaxable: number
  totalTax: number
  takeHome: number
  effectiveTaxRate: number
  isProjected: boolean // true if computed from growth assumptions, false if from explicit FY data
}
```

Write this file to `frontend/src/types/salary.ts`.

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd frontend && pnpm run type-check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/salary.ts
git commit -m "feat: add TypeScript types for salary, RSU, and growth projections"
```

---

## Task 6: Frontend — API Service & Query Hooks

**Files:**
- Modify: `frontend/src/services/api/preferences.ts`
- Modify: `frontend/src/hooks/api/usePreferences.ts`

- [ ] **Step 1: Extend the UserPreferences interface**

In `frontend/src/services/api/preferences.ts`, add the import at the top:

```typescript
import type { SalaryComponents, RsuGrant, GrowthAssumptions } from '@/types/salary'
```

Add these 3 fields to the `UserPreferences` interface (after `notify_days_ahead`):

```typescript
  // Salary & Tax Projections
  salary_structure: Record<string, SalaryComponents>
  rsu_grants: RsuGrant[]
  growth_assumptions: GrowthAssumptions
```

- [ ] **Step 2: Add config types and service methods**

Add these config types (after existing config types like `CreditCardLimitsConfig`):

```typescript
export interface SalaryStructureConfig {
  salary_structure: Record<string, SalaryComponents>
}

export interface RsuGrantsConfig {
  rsu_grants: RsuGrant[]
}

export interface GrowthAssumptionsConfig {
  growth_assumptions: GrowthAssumptions
}
```

Add these methods to the `preferencesService` object:

```typescript
  updateSalaryStructure: createSectionUpdater<SalaryStructureConfig>('salary-structure'),
  updateRsuGrants: createSectionUpdater<RsuGrantsConfig>('rsu-grants'),
  updateGrowthAssumptions: createSectionUpdater<GrowthAssumptionsConfig>('growth-assumptions'),
```

- [ ] **Step 3: Add mutation hooks**

In `frontend/src/hooks/api/usePreferences.ts`, add the import:

```typescript
import type { SalaryStructureConfig, RsuGrantsConfig, GrowthAssumptionsConfig } from '@/services/api/preferences'
```

Add these 3 mutation hooks (after existing section mutation hooks):

```typescript
export function useUpdateSalaryStructure() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: SalaryStructureConfig) =>
      preferencesService.updateSalaryStructure(config),
    onSuccess: () => invalidatePreferenceDependents(queryClient),
  })
}

export function useUpdateRsuGrants() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: RsuGrantsConfig) =>
      preferencesService.updateRsuGrants(config),
    onSuccess: () => invalidatePreferenceDependents(queryClient),
  })
}

export function useUpdateGrowthAssumptions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: GrowthAssumptionsConfig) =>
      preferencesService.updateGrowthAssumptions(config),
    onSuccess: () => invalidatePreferenceDependents(queryClient),
  })
}
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `cd frontend && pnpm run type-check`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/api/preferences.ts frontend/src/hooks/api/usePreferences.ts
git commit -m "feat: add salary, RSU, growth API service methods and query hooks"
```

---

## Task 7: Frontend — Zustand Store Extensions

**Files:**
- Modify: `frontend/src/store/preferencesStore.ts`

- [ ] **Step 1: Add imports and state**

Add the import at the top:

```typescript
import type { SalaryComponents, RsuGrant, GrowthAssumptions } from '@/types/salary'
import { DEFAULT_GROWTH_ASSUMPTIONS } from '@/types/salary'
```

Add these fields to the `PreferencesState` interface:

```typescript
  // Salary & Tax Projections
  salaryStructure: Record<string, SalaryComponents>
  rsuGrants: RsuGrant[]
  growthAssumptions: GrowthAssumptions

  // Actions
  setSalaryStructure: (structure: Record<string, SalaryComponents>) => void
  setRsuGrants: (grants: RsuGrant[]) => void
  setGrowthAssumptions: (assumptions: GrowthAssumptions) => void
```

- [ ] **Step 2: Add defaults, actions, and hydration**

Add defaults in the store initializer (alongside existing defaults):

```typescript
      salaryStructure: {},
      rsuGrants: [],
      growthAssumptions: { ...DEFAULT_GROWTH_ASSUMPTIONS },
```

Add setter actions:

```typescript
      setSalaryStructure: (structure) => set({ salaryStructure: structure }),
      setRsuGrants: (grants) => set({ rsuGrants: grants }),
      setGrowthAssumptions: (assumptions) => set({ growthAssumptions: assumptions }),
```

In `hydrateFromApi`, add hydration logic (follow existing validation patterns):

```typescript
        salaryStructure:
          apiPrefs.salary_structure && typeof apiPrefs.salary_structure === 'object'
            ? apiPrefs.salary_structure
            : {},
        rsuGrants: Array.isArray(apiPrefs.rsu_grants) ? apiPrefs.rsu_grants : [],
        growthAssumptions:
          apiPrefs.growth_assumptions && typeof apiPrefs.growth_assumptions === 'object'
            ? { ...DEFAULT_GROWTH_ASSUMPTIONS, ...apiPrefs.growth_assumptions }
            : { ...DEFAULT_GROWTH_ASSUMPTIONS },
```

- [ ] **Step 3: Add to partialize and add selectors**

Add to the `partialize` object:

```typescript
        salaryStructure: state.salaryStructure,
        rsuGrants: state.rsuGrants,
        growthAssumptions: state.growthAssumptions,
```

Add selectors at the bottom of the file:

```typescript
export const selectSalaryStructure = (state: PreferencesState) => state.salaryStructure
export const selectRsuGrants = (state: PreferencesState) => state.rsuGrants
export const selectGrowthAssumptions = (state: PreferencesState) => state.growthAssumptions
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `cd frontend && pnpm run type-check`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store/preferencesStore.ts
git commit -m "feat: add salary, RSU, growth state to preferences store"
```

---

## Task 8: Frontend — Projection Calculator

**Files:**
- Create: `frontend/src/lib/projectionCalculator.ts`
- Create: `frontend/src/lib/__tests__/projectionCalculator.test.ts`

- [ ] **Step 1: Write the failing tests first**

```typescript
import { describe, expect, it } from 'vitest'
import {
  getRsuVestingsByFY,
  projectFiscalYear,
  projectMultipleYears,
} from '../projectionCalculator'
import type { SalaryComponents, RsuGrant, GrowthAssumptions } from '@/types/salary'
import { DEFAULT_GROWTH_ASSUMPTIONS } from '@/types/salary'

const baseSalary: SalaryComponents = {
  base_salary_monthly: 80000,
  hra_monthly: null,
  bonus_annual: 200000,
  epf_monthly: 3600,
  nps_monthly: 0,
  special_allowance_annual: 0,
  other_taxable_annual: 50000,
}

const testGrant: RsuGrant = {
  id: 'g1',
  stock_name: 'AMZN',
  stock_price: 100, // simplified for testing
  grant_date: null,
  notes: null,
  vestings: [
    { date: '2026-03-15', quantity: 25 },
    { date: '2027-03-15', quantity: 25 },
    { date: '2028-03-15', quantity: 30 },
  ],
}

describe('getRsuVestingsByFY', () => {
  it('groups vestings by fiscal year (April start)', () => {
    const result = getRsuVestingsByFY([testGrant], 4, 0)
    // 2026-03-15 falls in FY 2025-26 (Apr 2025 - Mar 2026)
    expect(result['2025-26']).toBeDefined()
    expect(result['2025-26'].shares).toBe(25)
    expect(result['2025-26'].value).toBe(2500) // 25 * 100
    // 2027-03-15 falls in FY 2026-27
    expect(result['2026-27'].shares).toBe(25)
    // 2028-03-15 falls in FY 2027-28
    expect(result['2027-28'].shares).toBe(30)
    expect(result['2027-28'].value).toBe(3000)
  })

  it('applies stock appreciation', () => {
    // 10% appreciation, base year 2025-26
    const result = getRsuVestingsByFY([testGrant], 4, 10, 2025)
    // FY 2025-26 (year 0): no appreciation
    expect(result['2025-26'].value).toBe(2500)
    // FY 2026-27 (year 1): 10% appreciation on price
    expect(result['2026-27'].value).toBeCloseTo(25 * 110, 0) // 2750
    // FY 2027-28 (year 2): 21% appreciation on price (1.1^2)
    expect(result['2027-28'].value).toBeCloseTo(30 * 121, 0) // 3630
  })

  it('returns empty for no grants', () => {
    const result = getRsuVestingsByFY([], 4, 0)
    expect(Object.keys(result)).toHaveLength(0)
  })
})

describe('projectFiscalYear', () => {
  it('returns explicit FY data without growth applied', () => {
    const structure = { '2025-26': baseSalary }
    const result = projectFiscalYear(
      '2025-26',
      structure,
      [],
      DEFAULT_GROWTH_ASSUMPTIONS,
      4,
    )
    expect(result.fy).toBe('2025-26')
    expect(result.baseSalary).toBe(960000) // 80000 * 12
    expect(result.bonus).toBe(200000)
    expect(result.epf).toBe(43200) // 3600 * 12
    expect(result.isProjected).toBe(false)
  })

  it('projects future FY with base salary growth', () => {
    const structure = { '2025-26': baseSalary }
    const growth: GrowthAssumptions = {
      ...DEFAULT_GROWTH_ASSUMPTIONS,
      base_salary_growth_pct: 10,
    }
    const result = projectFiscalYear(
      '2026-27',
      structure,
      [],
      growth,
      4,
    )
    expect(result.fy).toBe('2026-27')
    expect(result.baseSalary).toBeCloseTo(1056000, 0) // 80000 * 1.1 * 12
    expect(result.isProjected).toBe(true)
  })

  it('sets bonus to 0 for future years when growth is 0', () => {
    const structure = { '2025-26': baseSalary }
    const result = projectFiscalYear(
      '2026-27',
      structure,
      [],
      DEFAULT_GROWTH_ASSUMPTIONS,
      4,
    )
    expect(result.bonus).toBe(0)
  })

  it('scales EPF with base when enabled', () => {
    const structure = { '2025-26': baseSalary }
    const growth: GrowthAssumptions = {
      ...DEFAULT_GROWTH_ASSUMPTIONS,
      base_salary_growth_pct: 10,
      epf_scales_with_base: true,
    }
    const result = projectFiscalYear(
      '2026-27',
      structure,
      [],
      growth,
      4,
    )
    expect(result.epf).toBeCloseTo(47520, 0) // 3600 * 1.1 * 12
  })

  it('includes RSU income for the target FY', () => {
    const structure = { '2025-26': baseSalary }
    const result = projectFiscalYear(
      '2025-26',
      structure,
      [testGrant],
      DEFAULT_GROWTH_ASSUMPTIONS,
      4,
    )
    expect(result.rsuIncome).toBe(2500) // 25 shares * 100
    expect(result.rsuDetails).toHaveLength(1)
    expect(result.rsuDetails[0].stock_name).toBe('AMZN')
  })

  it('computes tax using calculateTax', () => {
    const structure = { '2025-26': baseSalary }
    const result = projectFiscalYear(
      '2025-26',
      structure,
      [],
      DEFAULT_GROWTH_ASSUMPTIONS,
      4,
    )
    expect(result.totalTax).toBeGreaterThan(0)
    expect(result.takeHome).toBeLessThan(result.grossTaxable)
    expect(result.effectiveTaxRate).toBeGreaterThan(0)
    expect(result.effectiveTaxRate).toBeLessThan(100)
  })
})

describe('projectMultipleYears', () => {
  it('returns correct number of projected years', () => {
    const structure = { '2025-26': baseSalary }
    const growth: GrowthAssumptions = {
      ...DEFAULT_GROWTH_ASSUMPTIONS,
      projection_years: 3,
    }
    const results = projectMultipleYears(structure, [], growth, 4)
    expect(results).toHaveLength(4) // base year + 3 projected
  })

  it('returns empty array when no salary structure', () => {
    const results = projectMultipleYears({}, [], DEFAULT_GROWTH_ASSUMPTIONS, 4)
    expect(results).toHaveLength(0)
  })
})
```

Write this to `frontend/src/lib/__tests__/projectionCalculator.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && pnpm test -- --run src/lib/__tests__/projectionCalculator.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement the projection calculator**

```typescript
/**
 * Pure projection functions for multi-year tax planning.
 *
 * Takes salary structure + growth assumptions and produces per-FY
 * tax breakdowns using calculateTax() from taxCalculator.ts.
 */

import {
  calculateTax,
  getStandardDeduction,
  getTaxSlabs,
  parseFYStartYear,
} from '@/lib/taxCalculator'
import type {
  GrowthAssumptions,
  ProjectedFYBreakdown,
  RsuGrant,
  SalaryComponents,
} from '@/types/salary'

/** Increment a FY string by N years: "2025-26" + 1 → "2026-27" */
function offsetFY(fy: string, offset: number): string {
  const startYear = parseFYStartYear(fy) + offset
  const endYear = (startYear + 1) % 100
  return `${startYear}-${String(endYear).padStart(2, '0')}`
}

/** Get the FY string a date falls into given a fiscal year start month. */
function dateToFY(dateStr: string, fyStartMonth: number): string {
  const d = new Date(dateStr)
  const month = d.getMonth() + 1 // 1-12
  const year = d.getFullYear()
  const fyStartYear = month >= fyStartMonth ? year : year - 1
  const endYear = (fyStartYear + 1) % 100
  return `${fyStartYear}-${String(endYear).padStart(2, '0')}`
}

/** Group RSU vestings by fiscal year with optional stock appreciation. */
export function getRsuVestingsByFY(
  grants: RsuGrant[],
  fyStartMonth: number,
  stockAppreciationPct: number,
  baseStartYear?: number,
): Record<string, { shares: number; value: number; details: Array<{ stock_name: string; shares: number; value: number }> }> {
  const result: Record<string, { shares: number; value: number; details: Array<{ stock_name: string; shares: number; value: number }> }> = {}

  for (const grant of grants) {
    for (const vesting of grant.vestings) {
      const fy = dateToFY(vesting.date, fyStartMonth)
      const fyStart = parseFYStartYear(fy)
      const yearsFromBase = baseStartYear != null ? fyStart - baseStartYear : 0
      const appreciationFactor = Math.pow(1 + stockAppreciationPct / 100, Math.max(0, yearsFromBase))
      const adjustedPrice = grant.stock_price * appreciationFactor
      const vestingValue = vesting.quantity * adjustedPrice

      if (!result[fy]) {
        result[fy] = { shares: 0, value: 0, details: [] }
      }
      result[fy].shares += vesting.quantity
      result[fy].value += vestingValue

      const existing = result[fy].details.find((d) => d.stock_name === grant.stock_name)
      if (existing) {
        existing.shares += vesting.quantity
        existing.value += vestingValue
      } else {
        result[fy].details.push({
          stock_name: grant.stock_name,
          shares: vesting.quantity,
          value: vestingValue,
        })
      }
    }
  }

  return result
}

/** Project a single fiscal year's income and tax breakdown. */
export function projectFiscalYear(
  targetFY: string,
  salaryStructure: Record<string, SalaryComponents>,
  rsuGrants: RsuGrant[],
  growth: GrowthAssumptions,
  fyStartMonth: number,
): ProjectedFYBreakdown {
  // Find the base FY (most recent FY with explicit salary data at or before target)
  const sortedFYs = Object.keys(salaryStructure).sort()
  const baseFY = sortedFYs.filter((fy) => fy <= targetFY).at(-1) ?? sortedFYs[0]
  if (!baseFY || !salaryStructure[baseFY]) {
    return emptyBreakdown(targetFY)
  }

  const base = salaryStructure[baseFY]
  const isExplicit = targetFY in salaryStructure
  const yearsOffset = parseFYStartYear(targetFY) - parseFYStartYear(baseFY)

  // Apply growth for projected years
  const baseGrowthFactor = Math.pow(1 + growth.base_salary_growth_pct / 100, yearsOffset)

  const baseSalaryAnnual = (isExplicit ? salaryStructure[targetFY].base_salary_monthly : base.base_salary_monthly * baseGrowthFactor) * 12
  const hraAnnual = (() => {
    const src = isExplicit ? salaryStructure[targetFY] : base
    if (src.hra_monthly == null) return 0
    return (isExplicit ? src.hra_monthly : src.hra_monthly * baseGrowthFactor) * 12
  })()

  const bonusAnnual = (() => {
    if (isExplicit) return salaryStructure[targetFY].bonus_annual
    if (yearsOffset === 0) return base.bonus_annual
    if (growth.bonus_growth_pct === 0) return 0
    return base.bonus_annual * Math.pow(1 + growth.bonus_growth_pct / 100, yearsOffset)
  })()

  const epfAnnual = (() => {
    if (isExplicit) return salaryStructure[targetFY].epf_monthly * 12
    if (growth.epf_scales_with_base) return base.epf_monthly * baseGrowthFactor * 12
    return base.epf_monthly * 12
  })()

  const npsAnnual = (() => {
    if (isExplicit) return salaryStructure[targetFY].nps_monthly * 12
    const npsFactor = Math.pow(1 + growth.nps_growth_pct / 100, yearsOffset)
    return base.nps_monthly * npsFactor * 12
  })()

  const specialAllowanceAnnual = isExplicit
    ? salaryStructure[targetFY].special_allowance_annual
    : base.special_allowance_annual

  const otherTaxableAnnual = isExplicit
    ? salaryStructure[targetFY].other_taxable_annual
    : base.other_taxable_annual

  // RSU income for this FY
  const baseStartYear = parseFYStartYear(baseFY)
  const rsuByFY = getRsuVestingsByFY(
    rsuGrants,
    fyStartMonth,
    growth.stock_price_appreciation_pct,
    baseStartYear,
  )
  const rsuData = rsuByFY[targetFY] ?? { shares: 0, value: 0, details: [] }

  // Gross taxable income
  const grossTaxable =
    baseSalaryAnnual + hraAnnual + bonusAnnual + specialAllowanceAnnual + otherTaxableAnnual + rsuData.value - epfAnnual

  const fyStartYear = parseFYStartYear(targetFY)
  const standardDeduction = getStandardDeduction(fyStartYear)
  const netTaxable = Math.max(0, grossTaxable - standardDeduction)

  // Calculate tax using existing taxCalculator
  const slabs = getTaxSlabs(fyStartYear, 'new')
  const taxResult = calculateTax(
    grossTaxable,
    slabs,
    standardDeduction,
    true,
    12,
    true,
    fyStartYear,
  )

  const takeHome = grossTaxable - taxResult.totalTax
  const effectiveTaxRate = grossTaxable > 0 ? (taxResult.totalTax / grossTaxable) * 100 : 0

  return {
    fy: targetFY,
    baseSalary: baseSalaryAnnual,
    hra: hraAnnual,
    bonus: bonusAnnual,
    epf: epfAnnual,
    nps: npsAnnual,
    specialAllowance: specialAllowanceAnnual,
    otherTaxable: otherTaxableAnnual,
    rsuIncome: rsuData.value,
    rsuDetails: rsuData.details,
    grossTaxable,
    standardDeduction,
    netTaxable,
    totalTax: taxResult.totalTax,
    takeHome,
    effectiveTaxRate,
    isProjected: !isExplicit || yearsOffset > 0,
  }
}

/** Project multiple years starting from the latest FY with explicit salary data. */
export function projectMultipleYears(
  salaryStructure: Record<string, SalaryComponents>,
  rsuGrants: RsuGrant[],
  growth: GrowthAssumptions,
  fyStartMonth: number,
): ProjectedFYBreakdown[] {
  const sortedFYs = Object.keys(salaryStructure).sort()
  if (sortedFYs.length === 0) return []

  const latestFY = sortedFYs.at(-1)!
  const results: ProjectedFYBreakdown[] = []

  for (let i = 0; i <= growth.projection_years; i++) {
    const targetFY = offsetFY(latestFY, i)
    results.push(projectFiscalYear(targetFY, salaryStructure, rsuGrants, growth, fyStartMonth))
  }

  return results
}

function emptyBreakdown(fy: string): ProjectedFYBreakdown {
  return {
    fy,
    baseSalary: 0,
    hra: 0,
    bonus: 0,
    epf: 0,
    nps: 0,
    specialAllowance: 0,
    otherTaxable: 0,
    rsuIncome: 0,
    rsuDetails: [],
    grossTaxable: 0,
    standardDeduction: 0,
    netTaxable: 0,
    totalTax: 0,
    takeHome: 0,
    effectiveTaxRate: 0,
    isProjected: true,
  }
}
```

Write this to `frontend/src/lib/projectionCalculator.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && pnpm test -- --run src/lib/__tests__/projectionCalculator.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Run full frontend checks**

Run: `cd frontend && pnpm run type-check && pnpm test`
Expected: No type errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/projectionCalculator.ts frontend/src/lib/__tests__/projectionCalculator.test.ts
git commit -m "feat: add projection calculator with TDD tests for multi-year tax projections"
```

---

## Task 9: Frontend — Settings Page Integration (useSettingsState + SettingsPage)

**Files:**
- Modify: `frontend/src/pages/settings/useSettingsState.ts`
- Modify: `frontend/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Extend useSettingsState with salary/RSU/growth local state**

In `useSettingsState.ts`, add the import:

```typescript
import type { SalaryComponents, RsuGrant, GrowthAssumptions } from '@/types/salary'
import { DEFAULT_GROWTH_ASSUMPTIONS } from '@/types/salary'
```

Add local state for the 3 new fields (alongside existing `localPrefs` state):

```typescript
  const [localSalaryStructure, setLocalSalaryStructure] = useState<Record<string, SalaryComponents>>({})
  const [localRsuGrants, setLocalRsuGrants] = useState<RsuGrant[]>([])
  const [localGrowthAssumptions, setLocalGrowthAssumptions] = useState<GrowthAssumptions>({ ...DEFAULT_GROWTH_ASSUMPTIONS })
```

Initialize from preferences (in the existing `useEffect` that sets `localPrefs`):

```typescript
    if (preferences?.salary_structure) setLocalSalaryStructure(preferences.salary_structure)
    if (preferences?.rsu_grants) setLocalRsuGrants(preferences.rsu_grants)
    if (preferences?.growth_assumptions) {
      setLocalGrowthAssumptions({ ...DEFAULT_GROWTH_ASSUMPTIONS, ...preferences.growth_assumptions })
    }
```

Track changes — update `setHasChanges(true)` whenever these setters are called. Create wrapper setters:

```typescript
  const updateSalaryStructure = useCallback((structure: Record<string, SalaryComponents>) => {
    setLocalSalaryStructure(structure)
    setHasChanges(true)
  }, [])

  const updateRsuGrants = useCallback((grants: RsuGrant[]) => {
    setLocalRsuGrants(grants)
    setHasChanges(true)
  }, [])

  const updateGrowthAssumptions = useCallback((assumptions: GrowthAssumptions) => {
    setLocalGrowthAssumptions(assumptions)
    setHasChanges(true)
  }, [])
```

- [ ] **Step 2: Extend handleSave to persist the 3 new fields**

In the `handleSave` function, after `await updatePreferences.mutateAsync(localPrefs)`, add:

```typescript
      // Save salary/RSU/growth via dedicated endpoints
      await Promise.all([
        preferencesService.updateSalaryStructure({ salary_structure: localSalaryStructure }),
        preferencesService.updateRsuGrants({ rsu_grants: localRsuGrants }),
        preferencesService.updateGrowthAssumptions({ growth_assumptions: localGrowthAssumptions }),
      ])
```

Add the import for `preferencesService`:

```typescript
import { preferencesService } from '@/services/api/preferences'
```

- [ ] **Step 3: Return new state from the hook**

Add to the return object:

```typescript
    localSalaryStructure,
    localRsuGrants,
    localGrowthAssumptions,
    updateSalaryStructure,
    updateRsuGrants,
    updateGrowthAssumptions,
```

- [ ] **Step 4: Add SalaryStructureSection to SettingsPage**

In `SettingsPage.tsx`, add the import:

```typescript
import SalaryStructureSection from './settings/SalaryStructureSection'
```

Add the section rendering after IncomeClassificationSection and before FinancialSettingsSection. Find the FinancialSettingsSection render and add before it:

```tsx
        {s.localPrefs && (
          <SalaryStructureSection
            index={sectionIndex++}
            localSalaryStructure={s.localSalaryStructure}
            localRsuGrants={s.localRsuGrants}
            localGrowthAssumptions={s.localGrowthAssumptions}
            updateSalaryStructure={s.updateSalaryStructure}
            updateRsuGrants={s.updateRsuGrants}
            updateGrowthAssumptions={s.updateGrowthAssumptions}
            fiscalYearStartMonth={s.localPrefs.fiscal_year_start_month}
          />
        )}
```

- [ ] **Step 5: Verify TypeScript compilation**

Run: `cd frontend && pnpm run type-check`
Expected: Will fail because SalaryStructureSection doesn't exist yet — that's Task 10. If running in parallel, this task can be committed with a temporary `// @ts-expect-error` or the component can be a stub. Otherwise, proceed to Task 10 before committing.

- [ ] **Step 6: Commit (after Task 10 creates the component)**

```bash
git add frontend/src/pages/settings/useSettingsState.ts frontend/src/pages/SettingsPage.tsx
git commit -m "feat: integrate salary/RSU/growth into settings state management"
```

---

## Task 10: Frontend — SalaryStructureSection Component

**Files:**
- Create: `frontend/src/pages/settings/SalaryStructureSection.tsx`

- [ ] **Step 1: Create the SalaryStructureSection component**

This is the largest new file. It contains 3 subsections: Salary Grid (per FY), RSU Grants, and Growth Assumptions. Write to `frontend/src/pages/settings/SalaryStructureSection.tsx`:

```tsx
import { useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react'
import { fadeUpItem } from '@/constants/animations'
import { formatCurrency } from '@/lib/formatters'
import { CollapsibleSection } from '@/components/ui'
import type { SalaryComponents, RsuGrant, RsuVesting, GrowthAssumptions } from '@/types/salary'
import { DEFAULT_SALARY_COMPONENTS, DEFAULT_GROWTH_ASSUMPTIONS } from '@/types/salary'
import { getFYFromDate, parseFYStartYear } from '@/lib/taxCalculator'

interface Props {
  index: number
  localSalaryStructure: Record<string, SalaryComponents>
  localRsuGrants: RsuGrant[]
  localGrowthAssumptions: GrowthAssumptions
  updateSalaryStructure: (structure: Record<string, SalaryComponents>) => void
  updateRsuGrants: (grants: RsuGrant[]) => void
  updateGrowthAssumptions: (assumptions: GrowthAssumptions) => void
  fiscalYearStartMonth: number
}

/** Get the current FY string based on today's date. */
function currentFYLabel(fyStartMonth: number): string {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const startYear = month >= fyStartMonth ? year : year - 1
  const endYear = (startYear + 1) % 100
  return `${startYear}-${String(endYear).padStart(2, '0')}`
}

function nextFY(fy: string): string {
  const start = parseFYStartYear(fy) + 1
  const end = (start + 1) % 100
  return `${start}-${String(end).padStart(2, '0')}`
}

function prevFY(fy: string): string {
  const start = parseFYStartYear(fy) - 1
  const end = (start + 1) % 100
  return `${start}-${String(end).padStart(2, '0')}`
}

const inputClass =
  'w-full px-3 py-2 bg-white/5 border border-border rounded-lg text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary'

export default function SalaryStructureSection({
  index,
  localSalaryStructure,
  localRsuGrants,
  localGrowthAssumptions,
  updateSalaryStructure,
  updateRsuGrants,
  updateGrowthAssumptions,
  fiscalYearStartMonth,
}: Readonly<Props>) {
  const fyKeys = useMemo(() => Object.keys(localSalaryStructure).sort(), [localSalaryStructure])
  const defaultFY = currentFYLabel(fiscalYearStartMonth)
  const [activeFY, setActiveFY] = useState(fyKeys[0] ?? defaultFY)

  const currentComp = localSalaryStructure[activeFY] ?? DEFAULT_SALARY_COMPONENTS

  const updateField = useCallback(
    (field: keyof SalaryComponents, value: number | null) => {
      updateSalaryStructure({
        ...localSalaryStructure,
        [activeFY]: { ...currentComp, [field]: value },
      })
    },
    [activeFY, currentComp, localSalaryStructure, updateSalaryStructure],
  )

  const addFY = useCallback(() => {
    const newFY = fyKeys.length > 0 ? nextFY(fyKeys.at(-1)!) : defaultFY
    if (!localSalaryStructure[newFY]) {
      updateSalaryStructure({
        ...localSalaryStructure,
        [newFY]: { ...DEFAULT_SALARY_COMPONENTS },
      })
      setActiveFY(newFY)
    }
  }, [fyKeys, defaultFY, localSalaryStructure, updateSalaryStructure])

  const annualCTC = useMemo(() => {
    const c = currentComp
    return (
      c.base_salary_monthly * 12 +
      (c.hra_monthly ?? 0) * 12 +
      c.bonus_annual +
      c.epf_monthly * 12 +
      c.nps_monthly * 12 +
      c.special_allowance_annual +
      c.other_taxable_annual
    )
  }, [currentComp])

  // RSU helpers
  const addGrant = useCallback(() => {
    const newGrant: RsuGrant = {
      id: crypto.randomUUID(),
      stock_name: '',
      stock_price: 0,
      grant_date: null,
      notes: null,
      vestings: [{ date: new Date().toISOString().slice(0, 10), quantity: 1 }],
    }
    updateRsuGrants([...localRsuGrants, newGrant])
  }, [localRsuGrants, updateRsuGrants])

  const updateGrant = useCallback(
    (grantId: string, updates: Partial<RsuGrant>) => {
      updateRsuGrants(
        localRsuGrants.map((g) => (g.id === grantId ? { ...g, ...updates } : g)),
      )
    },
    [localRsuGrants, updateRsuGrants],
  )

  const removeGrant = useCallback(
    (grantId: string) => {
      updateRsuGrants(localRsuGrants.filter((g) => g.id !== grantId))
    },
    [localRsuGrants, updateRsuGrants],
  )

  const addVesting = useCallback(
    (grantId: string) => {
      updateRsuGrants(
        localRsuGrants.map((g) => {
          if (g.id !== grantId) return g
          return {
            ...g,
            vestings: [
              ...g.vestings,
              { date: new Date().toISOString().slice(0, 10), quantity: 1 },
            ],
          }
        }),
      )
    },
    [localRsuGrants, updateRsuGrants],
  )

  const removeVesting = useCallback(
    (grantId: string, vestIdx: number) => {
      updateRsuGrants(
        localRsuGrants.map((g) => {
          if (g.id !== grantId) return g
          const vestings = g.vestings.filter((_, i) => i !== vestIdx)
          return { ...g, vestings: vestings.length > 0 ? vestings : g.vestings }
        }),
      )
    },
    [localRsuGrants, updateRsuGrants],
  )

  const updateVesting = useCallback(
    (grantId: string, vestIdx: number, updates: Partial<RsuVesting>) => {
      updateRsuGrants(
        localRsuGrants.map((g) => {
          if (g.id !== grantId) return g
          return {
            ...g,
            vestings: g.vestings.map((v, i) => (i === vestIdx ? { ...v, ...updates } : v)),
          }
        }),
      )
    },
    [localRsuGrants, updateRsuGrants],
  )

  return (
    <motion.div variants={fadeUpItem}>
      <CollapsibleSection
        index={index}
        icon={Banknote}
        title="Income & Salary Structure"
        subtitle="Define compensation components, RSU grants, and growth projections"
      >
        <div className="space-y-6">
          {/* ── Salary Structure ──────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-white">Salary Structure</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const prev = prevFY(activeFY)
                    if (localSalaryStructure[prev]) setActiveFY(prev)
                  }}
                  disabled={!localSalaryStructure[prevFY(activeFY)]}
                  className="p-1 rounded border border-border text-muted-foreground hover:text-white disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-semibold text-primary min-w-[80px] text-center">
                  FY {activeFY}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = nextFY(activeFY)
                    if (localSalaryStructure[next]) setActiveFY(next)
                  }}
                  disabled={!localSalaryStructure[nextFY(activeFY)]}
                  className="p-1 rounded border border-border text-muted-foreground hover:text-white disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={addFY}
                  className="ml-2 flex items-center gap-1 px-3 py-1.5 text-xs bg-primary/20 text-primary border border-primary/30 rounded-lg hover:bg-primary/30"
                >
                  <Plus className="w-3 h-3" /> Add FY
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {([
                ['base_salary_monthly', 'Base Salary (Monthly)', false],
                ['hra_monthly', 'HRA (Monthly)', true],
                ['bonus_annual', 'Bonus (Annual)', false],
                ['epf_monthly', 'EPF (Monthly)', false],
                ['nps_monthly', 'NPS (Monthly)', true],
                ['special_allowance_annual', 'Special Allowance (Annual)', false],
                ['other_taxable_annual', 'Other Taxable (Annual)', false],
              ] as [keyof SalaryComponents, string, boolean][]).map(
                ([field, label, optional]) => (
                  <div
                    key={field}
                    className="bg-white/[0.03] border border-border rounded-lg p-3"
                  >
                    <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-1.5">
                      {label}
                      {optional && (
                        <span className="ml-1 text-muted-foreground/50 normal-case italic">
                          -- optional
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={currentComp[field] ?? ''}
                      placeholder={optional ? 'Not set' : '0'}
                      onChange={(e) => {
                        const val = e.target.value
                        updateField(
                          field,
                          val === '' && optional ? null : Number(val),
                        )
                      }}
                      className={inputClass}
                    />
                  </div>
                ),
              )}
            </div>

            {/* Annual CTC Summary */}
            <div className="mt-4 bg-app-card border border-primary/20 rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Total Annual CTC (excl. RSUs)
                </div>
                <div className="text-xl font-bold text-income mt-1">
                  {formatCurrency(annualCTC)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Monthly (pre-tax)</div>
                <div className="text-lg font-semibold text-white mt-1">
                  {formatCurrency(annualCTC / 12)}
                </div>
              </div>
            </div>
          </div>

          {/* ── RSU Grants ────────────────────────────────────────── */}
          <div className="pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-medium text-white">RSU Grants</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Track stock grants and vesting schedule
                </p>
              </div>
              <button
                type="button"
                onClick={addGrant}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary/20 text-primary border border-primary/30 rounded-lg hover:bg-primary/30"
              >
                <Plus className="w-3 h-3" /> Add Grant
              </button>
            </div>

            {localRsuGrants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No RSU grants configured. Add a grant to track vesting income.
              </p>
            ) : (
              <div className="space-y-4">
                {localRsuGrants.map((grant) => (
                  <div
                    key={grant.id}
                    className="bg-white/[0.03] border border-border rounded-lg p-4"
                  >
                    {/* Grant Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          value={grant.stock_name}
                          placeholder="Stock ticker"
                          onChange={(e) =>
                            updateGrant(grant.id, { stock_name: e.target.value })
                          }
                          className="w-24 px-2 py-1 bg-primary/20 text-primary font-semibold text-sm rounded border border-primary/30 placeholder:text-primary/50"
                        />
                        <input
                          type="text"
                          value={grant.notes ?? ''}
                          placeholder="Label (optional)"
                          onChange={(e) =>
                            updateGrant(grant.id, {
                              notes: e.target.value || null,
                            })
                          }
                          className="w-40 px-2 py-1 bg-white/5 border border-border rounded text-sm text-muted-foreground placeholder:text-muted-foreground/50"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[10px] text-muted-foreground uppercase">
                            Price/Share
                          </div>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={grant.stock_price || ''}
                            placeholder="0.00"
                            onChange={(e) =>
                              updateGrant(grant.id, {
                                stock_price: Number(e.target.value),
                              })
                            }
                            className="w-28 px-2 py-1 bg-white/5 border border-border rounded text-sm text-white text-right"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeGrant(grant.id)}
                          className="p-1.5 text-red-400 hover:bg-red-400/10 rounded border border-red-400/30"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Vesting Table */}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground text-xs">
                          <th className="text-left py-2 font-medium">Vesting Date</th>
                          <th className="text-right py-2 font-medium">Shares</th>
                          <th className="text-right py-2 font-medium">Est. Value</th>
                          <th className="text-right py-2 font-medium">FY</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {grant.vestings.map((v, vi) => (
                          <tr key={vi} className="border-b border-border/50">
                            <td className="py-2">
                              <input
                                type="date"
                                value={v.date}
                                onChange={(e) =>
                                  updateVesting(grant.id, vi, {
                                    date: e.target.value,
                                  })
                                }
                                className="bg-white/5 border border-border rounded px-2 py-1 text-white text-sm"
                              />
                            </td>
                            <td className="py-2 text-right">
                              <input
                                type="number"
                                min="1"
                                value={v.quantity}
                                onChange={(e) =>
                                  updateVesting(grant.id, vi, {
                                    quantity: Math.max(1, Number(e.target.value)),
                                  })
                                }
                                className="w-20 bg-white/5 border border-border rounded px-2 py-1 text-white text-sm text-right"
                              />
                            </td>
                            <td className="py-2 text-right text-income font-medium">
                              {formatCurrency(v.quantity * grant.stock_price)}
                            </td>
                            <td className="py-2 text-right text-primary text-xs">
                              {getFYFromDate(v.date, fiscalYearStartMonth)}
                            </td>
                            <td className="py-2 text-right">
                              {grant.vestings.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeVesting(grant.id, vi)}
                                  className="text-muted-foreground hover:text-red-400"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => addVesting(grant.id)}
                        className="text-xs text-muted-foreground border border-dashed border-border px-3 py-1 rounded hover:text-white"
                      >
                        + Add Vesting Date
                      </button>
                      <div className="text-sm text-muted-foreground">
                        Total: {grant.vestings.reduce((s, v) => s + v.quantity, 0)} shares
                        <span className="ml-2 text-income font-semibold">
                          {formatCurrency(
                            grant.vestings.reduce(
                              (s, v) => s + v.quantity * grant.stock_price,
                              0,
                            ),
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Growth Assumptions ─────────────────────────────────── */}
          <div className="pt-4 border-t border-border">
            <div className="mb-4">
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Growth Assumptions
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Used for multi-year projections on Tax Planning page
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {([
                ['base_salary_growth_pct', 'Base Salary Growth', '%/yr'],
                ['stock_price_appreciation_pct', 'Stock Appreciation', '%/yr'],
                ['projection_years', 'Projection Horizon', 'years'],
                ['bonus_growth_pct', 'Bonus Growth', '%/yr'],
                ['nps_growth_pct', 'NPS Growth', '%/yr'],
              ] as [keyof GrowthAssumptions, string, string][]).map(
                ([field, label, suffix]) => (
                  <div
                    key={field}
                    className="bg-white/[0.03] border border-border rounded-lg p-3"
                  >
                    <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-1.5">
                      {label}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={field === 'projection_years' ? 1 : 0}
                        max={field === 'projection_years' ? 5 : undefined}
                        step={field === 'projection_years' ? 1 : 0.5}
                        value={localGrowthAssumptions[field] as number}
                        onChange={(e) =>
                          updateGrowthAssumptions({
                            ...localGrowthAssumptions,
                            [field]: Number(e.target.value),
                          })
                        }
                        className={inputClass}
                      />
                      <span className="text-xs text-muted-foreground shrink-0">
                        {suffix}
                      </span>
                    </div>
                  </div>
                ),
              )}

              {/* EPF Scales With Base toggle */}
              <div className="bg-white/[0.03] border border-border rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">
                    EPF Scales With Base
                  </div>
                  <div className="text-[11px] text-muted-foreground/70 mt-0.5">
                    Auto-increase when base grows
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateGrowthAssumptions({
                      ...localGrowthAssumptions,
                      epf_scales_with_base: !localGrowthAssumptions.epf_scales_with_base,
                    })
                  }
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    localGrowthAssumptions.epf_scales_with_base
                      ? 'bg-income'
                      : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      localGrowthAssumptions.epf_scales_with_base
                        ? 'translate-x-[22px]'
                        : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleSection>
    </motion.div>
  )
}
```

Write this to `frontend/src/pages/settings/SalaryStructureSection.tsx`.

- [ ] **Step 2: Verify TypeScript compilation and lint**

Run: `cd frontend && pnpm run type-check && pnpm run lint`
Expected: No errors.

- [ ] **Step 3: Commit (combined with Task 9)**

```bash
git add frontend/src/pages/settings/SalaryStructureSection.tsx frontend/src/pages/settings/useSettingsState.ts frontend/src/pages/SettingsPage.tsx
git commit -m "feat: add Income & Salary Structure settings section with FY salary grid, RSU grants, and growth assumptions"
```

---

## Task 11: Frontend — Tax Planning Page Enhancement

**Files:**
- Modify: `frontend/src/pages/TaxPlanningPage.tsx`

This is the most complex modification. The changes are:
1. Extend FY navigator to allow future FYs
2. Add projection toggle
3. Show salary-based income breakdown when projection is active
4. Add multi-year comparison table
5. Add projection insights

- [ ] **Step 1: Add imports**

Add at the top of TaxPlanningPage.tsx:

```typescript
import { projectFiscalYear, projectMultipleYears } from '@/lib/projectionCalculator'
import { usePreferencesStore, selectSalaryStructure, selectRsuGrants, selectGrowthAssumptions } from '@/store/preferencesStore'
import type { ProjectedFYBreakdown } from '@/types/salary'
```

- [ ] **Step 2: Add store selectors inside the component**

Inside the component function, add after existing hooks:

```typescript
  const salaryStructure = usePreferencesStore(selectSalaryStructure)
  const rsuGrants = usePreferencesStore(selectRsuGrants)
  const growthAssumptions = usePreferencesStore(selectGrowthAssumptions)
  const hasSalaryData = Object.keys(salaryStructure).length > 0

  const [projectionSource, setProjectionSource] = useState<'transactions' | 'salary'>('transactions')
```

- [ ] **Step 3: Extend FY navigation to include future FYs**

Replace the existing `fyList` and navigation logic. The key change is computing projected FY list that extends into the future when salary data exists:

```typescript
  const projectedFYList = useMemo(() => {
    if (!hasSalaryData) return []
    const salaryFYs = Object.keys(salaryStructure).sort()
    const latestSalaryFY = salaryFYs.at(-1)
    if (!latestSalaryFY) return []
    const latestStart = parseFYStartYear(latestSalaryFY)
    const futureFYs: string[] = []
    for (let i = 1; i <= growthAssumptions.projection_years; i++) {
      const yr = latestStart + i
      const end = (yr + 1) % 100
      futureFYs.push(`${yr}-${String(end).padStart(2, '0')}`)
    }
    return futureFYs
  }, [hasSalaryData, salaryStructure, growthAssumptions.projection_years])

  // Combined FY list: transaction-based + future projected
  const combinedFYList = useMemo(() => {
    const txFYs = Object.keys(transactionsByFY).sort().reverse()
    const allFYs = new Set([...txFYs, ...projectedFYList])
    return [...allFYs].sort().reverse()
  }, [transactionsByFY, projectedFYList])
```

Update the navigation handlers to use `combinedFYList` instead of `fyList`:

```typescript
  const currentIndex = combinedFYList.indexOf(effectiveFY)
  const canGoBack = currentIndex < combinedFYList.length - 1
  const canGoForward = currentIndex > 0

  const goToPreviousFY = () => {
    if (canGoBack) setSelectedFY(combinedFYList[currentIndex + 1])
  }
  const goToNextFY = () => {
    if (canGoForward) setSelectedFY(combinedFYList[currentIndex - 1])
  }
```

- [ ] **Step 4: Compute projection data**

Add the salary-based projection memo:

```typescript
  const salaryProjection = useMemo<ProjectedFYBreakdown | null>(() => {
    if (!hasSalaryData || projectionSource !== 'salary') return null
    return projectFiscalYear(effectiveFY, salaryStructure, rsuGrants, growthAssumptions, fiscalYearStartMonth)
  }, [hasSalaryData, projectionSource, effectiveFY, salaryStructure, rsuGrants, growthAssumptions, fiscalYearStartMonth])

  const multiYearProjections = useMemo<ProjectedFYBreakdown[]>(() => {
    if (!hasSalaryData) return []
    return projectMultipleYears(salaryStructure, rsuGrants, growthAssumptions, fiscalYearStartMonth)
  }, [hasSalaryData, salaryStructure, rsuGrants, growthAssumptions, fiscalYearStartMonth])

  // Auto-switch to salary source for future FYs
  const isFutureFY = projectedFYList.includes(effectiveFY) && !transactionsByFY[effectiveFY]
  const effectiveSource = isFutureFY ? 'salary' : projectionSource
```

- [ ] **Step 5: Add projection source toggle to JSX**

After the existing FY navigation buttons and before the main content, add the toggle:

```tsx
          {hasSalaryData && (
            <div className="flex gap-1 bg-white/5 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setProjectionSource('transactions')}
                disabled={isFutureFY}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  effectiveSource === 'transactions'
                    ? 'bg-white/10 text-white'
                    : 'text-muted-foreground hover:text-white'
                } disabled:opacity-30`}
              >
                From Transactions
              </button>
              <button
                type="button"
                onClick={() => setProjectionSource('salary')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  effectiveSource === 'salary'
                    ? 'bg-white/10 text-white'
                    : 'text-muted-foreground hover:text-white'
                }`}
              >
                {isFutureFY ? 'Projection' : 'From Salary Structure'}
              </button>
            </div>
          )}
```

- [ ] **Step 6: Add salary-based income breakdown panel**

When `effectiveSource === 'salary'` and `salaryProjection` is available, render an income component breakdown and tax computation. Add this section conditionally within the main content area (after the toggle, before or alongside the existing slab breakdown):

```tsx
          {effectiveSource === 'salary' && salaryProjection && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Income Components */}
              <div className="bg-app-card rounded-xl border border-border p-5">
                <h3 className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
                  Annual Income Components
                </h3>
                <div className="space-y-2">
                  {[
                    ['Base Salary', salaryProjection.baseSalary],
                    ['HRA', salaryProjection.hra],
                    ['Bonus & Extras', salaryProjection.bonus],
                    ['RSU Vesting', salaryProjection.rsuIncome],
                    ['Special Allowance', salaryProjection.specialAllowance],
                    ['Other Taxable', salaryProjection.otherTaxable],
                    ['EPF (deducted)', -salaryProjection.epf],
                  ].filter(([, val]) => val !== 0).map(([label, val]) => (
                    <div key={label as string} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{label as string}</span>
                      <span className={`font-medium ${(val as number) < 0 ? 'text-muted-foreground' : 'text-white'}`}>
                        {formatCurrency(val as number)}
                      </span>
                    </div>
                  ))}
                  <div className="pt-2 mt-2 border-t border-border flex justify-between">
                    <span className="text-white font-semibold">Gross Taxable</span>
                    <span className="text-income font-bold text-lg">
                      {formatCurrency(salaryProjection.grossTaxable)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Less: Standard Deduction</span>
                    <span className="text-muted-foreground">
                      -{formatCurrency(salaryProjection.standardDeduction)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white font-semibold">Net Taxable</span>
                    <span className="text-primary font-bold text-lg">
                      {formatCurrency(salaryProjection.netTaxable)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tax Computation */}
              <div className="bg-app-card rounded-xl border border-border p-5">
                <h3 className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
                  Projected Tax
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Tax</span>
                    <span className="text-expense font-bold text-lg">
                      {formatCurrency(salaryProjection.totalTax)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Effective Tax Rate</span>
                    <span className="text-app-yellow font-semibold">
                      {salaryProjection.effectiveTaxRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Monthly TDS (approx)</span>
                    <span className="text-white font-medium">
                      {formatCurrency(salaryProjection.totalTax / 12)}
                    </span>
                  </div>
                  <div className="pt-3 mt-3 border-t border-border">
                    <div className="flex justify-between">
                      <span className="text-income font-semibold">Annual Take-Home</span>
                      <span className="text-income font-bold text-lg">
                        {formatCurrency(salaryProjection.takeHome)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-muted-foreground">Monthly Take-Home</span>
                      <span className="text-white font-medium">
                        {formatCurrency(salaryProjection.takeHome / 12)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
```

- [ ] **Step 7: Add multi-year projection table**

Add a collapsible section after the main tax content area:

```tsx
          {hasSalaryData && multiYearProjections.length > 1 && (
            <div className="bg-app-card rounded-xl border border-border p-5">
              <h3 className="text-sm font-semibold text-white mb-4">
                Multi-Year Projection
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[500px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-muted-foreground font-medium">Component</th>
                      {multiYearProjections.map((p) => (
                        <th key={p.fy} className="text-right py-2 text-primary font-semibold">
                          FY {p.fy}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Base Salary', (p: ProjectedFYBreakdown) => p.baseSalary],
                      ['Bonus', (p: ProjectedFYBreakdown) => p.bonus],
                      ['RSU Vesting', (p: ProjectedFYBreakdown) => p.rsuIncome],
                      ['EPF', (p: ProjectedFYBreakdown) => -p.epf],
                      ['Other', (p: ProjectedFYBreakdown) => p.otherTaxable + p.specialAllowance],
                    ].map(([label, getter]) => (
                      <tr key={label as string} className="border-b border-border/50">
                        <td className="py-2 text-muted-foreground">{label as string}</td>
                        {multiYearProjections.map((p) => (
                          <td key={p.fy} className="py-2 text-right text-white">
                            {formatCurrency((getter as (p: ProjectedFYBreakdown) => number)(p))}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="border-b border-border bg-white/[0.02]">
                      <td className="py-2 text-white font-semibold">Gross Taxable</td>
                      {multiYearProjections.map((p) => (
                        <td key={p.fy} className="py-2 text-right text-income font-bold">
                          {formatCurrency(p.grossTaxable)}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-white/[0.02]">
                      <td className="py-2 text-expense font-semibold">Total Tax</td>
                      {multiYearProjections.map((p) => (
                        <td key={p.fy} className="py-2 text-right text-expense font-bold">
                          {formatCurrency(p.totalTax)}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-t border-income/30 bg-income/5">
                      <td className="py-2 text-income font-semibold">Take-Home</td>
                      {multiYearProjections.map((p) => (
                        <td key={p.fy} className="py-2 text-right text-income font-bold">
                          {formatCurrency(p.takeHome)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
```

- [ ] **Step 8: Verify compilation and lint**

Run: `cd frontend && pnpm run type-check && pnpm run lint`
Expected: No errors. Some adjustments may be needed based on exact existing JSX structure — adapt the insertion points to match the actual file.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/TaxPlanningPage.tsx
git commit -m "feat: extend Tax Planning page with salary-based projections and multi-year comparison"
```

---

## Task 12: Full Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full check suite**

Run: `cd /c/Code/GitHub/projects/ledger-sync && pnpm run check`
Expected: All lint, type-check, and tests pass for both backend and frontend.

- [ ] **Step 2: Fix any issues**

If any failures, fix them. Common issues:
- Import paths that need adjustment
- Type mismatches between store and component props
- Missing `type` keyword in import statements

- [ ] **Step 3: Final commit if fixes were needed**

```bash
git add -u
git commit -m "fix: resolve integration issues from income tax projections feature"
```

- [ ] **Step 4: Push branch**

```bash
git push -u origin feat/income-tax-projections
```
