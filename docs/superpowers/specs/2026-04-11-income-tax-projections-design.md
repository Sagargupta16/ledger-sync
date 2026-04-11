# Income & Tax Projections Design Spec

**Date:** 2026-04-11
**Branch:** `feat/income-tax-projections`
**Status:** Approved

## Overview

Add forward-looking income and tax projection capabilities to Ledger Sync. Users define their salary structure (base, bonus, RSUs, EPF, NPS, etc.) in Settings, configure growth assumptions, and the Tax Planning page projects tax liability, take-home pay, and optimization suggestions for current and future fiscal years.

## Goals

1. Let users input structured salary components per fiscal year in Settings
2. Track RSU grants with full vesting schedules (stock name, price, multiple vesting dates/quantities)
3. Define growth assumptions (base raise %, stock appreciation, etc.) for multi-year projections
4. Enhance Tax Planning page to show salary-based tax projections alongside transaction-based calculations
5. Extend FY navigation into future years with automatic projection mode
6. Provide smart insights (slab jumps, missing data warnings, tax-saving suggestions)

## Non-Goals

- Server-side projection computation (stays client-side in taxCalculator.ts)
- Live stock price fetching (user manually updates price per share)
- Old Regime deduction optimization (already handled by existing regime comparison widget)
- Payslip/Form 16 import

---

## 1. Data Model

All data stored as JSON fields in the existing `user_preferences` table. No new tables.

### 1.1 `salary_structure` (JSON column, default `{}`)

Dict keyed by fiscal year string. Each value is a salary component breakdown.

```json
{
  "2025-26": {
    "base_salary_monthly": 80000,
    "hra_monthly": null,
    "bonus_annual": 200000,
    "epf_monthly": 3600,
    "nps_monthly": 0,
    "special_allowance_annual": 0,
    "other_taxable_annual": 50000
  }
}
```

**Field definitions:**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `base_salary_monthly` | Decimal | 0 | Monthly gross base |
| `hra_monthly` | Decimal or null | null | Optional; used for old regime HRA deduction calc |
| `bonus_annual` | Decimal | 0 | All taxable extras beyond base (bonus, food card, etc.) |
| `epf_monthly` | Decimal | 3600 | Employer EPF contribution |
| `nps_monthly` | Decimal | 0 | Employer NPS contribution (Section 80CCD(2)) |
| `special_allowance_annual` | Decimal | 0 | Other taxable allowances |
| `other_taxable_annual` | Decimal | 0 | Rental income, freelance, etc. |

### 1.2 `rsu_grants` (JSON column, default `[]`)

Array of RSU grant objects, each with inline vesting entries.

```json
[
  {
    "id": "grant-abc123",
    "stock_name": "AMZN",
    "stock_price": 185.50,
    "grant_date": "2025-03-15",
    "notes": "Joining grant",
    "vestings": [
      { "date": "2026-03-15", "quantity": 25 },
      { "date": "2027-03-15", "quantity": 25 },
      { "date": "2028-03-15", "quantity": 30 },
      { "date": "2029-03-15", "quantity": 20 }
    ]
  }
]
```

**Grant fields:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | Client-generated UUID for keying |
| `stock_name` | string | yes | Ticker or display name |
| `stock_price` | Decimal | yes | Current/estimated price per share (user's currency) |
| `grant_date` | date string or null | no | When the grant was awarded |
| `notes` | string or null | no | User label |
| `vestings` | array | yes | At least 1 entry |

**Vesting entry fields:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `date` | date string | yes | YYYY-MM-DD vesting date |
| `quantity` | int (> 0) | yes | Number of shares vesting |

### 1.3 `growth_assumptions` (JSON column, default `{}`)

Single object with projection parameters.

```json
{
  "base_salary_growth_pct": 0,
  "bonus_growth_pct": 0,
  "epf_scales_with_base": true,
  "nps_growth_pct": 0,
  "stock_price_appreciation_pct": 0,
  "projection_years": 3
}
```

**Field definitions:**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `base_salary_growth_pct` | float | 0 | Annual base salary raise %. 0 = no growth until user sets it. |
| `bonus_growth_pct` | float | 0 | 0 = bonus does NOT carry forward to future years (treated as one-time per FY). |
| `epf_scales_with_base` | bool | true | If true, EPF monthly scales proportionally when base grows. |
| `nps_growth_pct` | float | 0 | Annual NPS increase %. 0 = stays same. |
| `stock_price_appreciation_pct` | float | 0 | Annual stock price growth for RSU value projections. 0 = use current price. |
| `projection_years` | int (1-5) | 3 | How many future FYs to project. |

### 1.4 Migration

Single Alembic migration adding 3 JSON columns to `user_preferences`:

```python
op.add_column('user_preferences', sa.Column('salary_structure', sa.JSON(), server_default='{}', nullable=False))
op.add_column('user_preferences', sa.Column('rsu_grants', sa.JSON(), server_default='[]', nullable=False))
op.add_column('user_preferences', sa.Column('growth_assumptions', sa.JSON(), server_default='{}', nullable=False))
```

Empty `downgrade()` (consistent with existing migration pattern post-2026-02-03).

---

## 2. API Layer

Extends existing preferences router (`backend/src/ledger_sync/api/preferences.py`).

### 2.1 New Endpoints

| Method | Endpoint | Body Schema | Purpose |
|--------|----------|-------------|---------|
| `PUT` | `/preferences/salary-structure` | `SalaryStructureConfig` | Update salary structure for one or more FYs |
| `PUT` | `/preferences/rsu-grants` | `RsuGrantsConfig` | Replace full RSU grants array |
| `PUT` | `/preferences/growth-assumptions` | `GrowthAssumptionsConfig` | Update growth projection parameters |

All endpoints follow the existing `_update_section()` helper pattern: validate via Pydantic, persist JSON to column, return full preferences response.

### 2.2 Pydantic Schemas

New file: `backend/src/ledger_sync/schemas/salary.py`

```python
class SalaryComponents(BaseModel):
    base_salary_monthly: Decimal = Decimal(0)
    hra_monthly: Decimal | None = None
    bonus_annual: Decimal = Decimal(0)
    epf_monthly: Decimal = Decimal(3600)
    nps_monthly: Decimal = Decimal(0)
    special_allowance_annual: Decimal = Decimal(0)
    other_taxable_annual: Decimal = Decimal(0)

class SalaryStructureConfig(BaseModel):
    salary_structure: dict[str, SalaryComponents]  # keyed by FY string e.g. "2025-26"

class RsuVesting(BaseModel):
    date: date
    quantity: int = Field(gt=0)

class RsuGrant(BaseModel):
    id: str
    stock_name: str = Field(min_length=1)
    stock_price: Decimal = Field(gt=0)
    grant_date: date | None = None
    notes: str | None = None
    vestings: list[RsuVesting] = Field(min_length=1)

class RsuGrantsConfig(BaseModel):
    rsu_grants: list[RsuGrant]

class GrowthAssumptionsConfig(BaseModel):
    base_salary_growth_pct: float = 0
    bonus_growth_pct: float = 0
    epf_scales_with_base: bool = True
    nps_growth_pct: float = 0
    stock_price_appreciation_pct: float = 0
    projection_years: int = Field(default=3, ge=1, le=5)
```

### 2.3 Response Changes

`UserPreferencesResponse` extended with 3 new fields:

```python
salary_structure: dict[str, Any] = {}
rsu_grants: list[dict[str, Any]] = []
growth_assumptions: dict[str, Any] = {}
```

Existing `GET /preferences` and `PUT /preferences` endpoints automatically include the new fields.

---

## 3. Frontend: Preferences Store

### 3.1 Store Changes (`frontend/src/store/preferencesStore.ts`)

New state fields:

```typescript
salaryStructure: Record<string, SalaryComponents>  // keyed by FY
rsuGrants: RsuGrant[]
growthAssumptions: GrowthAssumptions
```

New actions:

```typescript
setSalaryStructure(structure: Record<string, SalaryComponents>): void
setRsuGrants(grants: RsuGrant[]): void
setGrowthAssumptions(assumptions: GrowthAssumptions): void
```

`hydrateFromApi()` extended to populate new fields. New selectors for each.

### 3.2 TypeScript Types (`frontend/src/types/salary.ts`)

```typescript
interface SalaryComponents {
  base_salary_monthly: number
  hra_monthly: number | null
  bonus_annual: number
  epf_monthly: number
  nps_monthly: number
  special_allowance_annual: number
  other_taxable_annual: number
}

interface RsuVesting {
  date: string  // YYYY-MM-DD
  quantity: number
}

interface RsuGrant {
  id: string
  stock_name: string
  stock_price: number
  grant_date: string | null
  notes: string | null
  vestings: RsuVesting[]
}

interface GrowthAssumptions {
  base_salary_growth_pct: number
  bonus_growth_pct: number
  epf_scales_with_base: boolean
  nps_growth_pct: number
  stock_price_appreciation_pct: number
  projection_years: number
}
```

### 3.3 API Hooks (`frontend/src/hooks/api/`)

New mutations (TanStack Query):

```typescript
useSalaryStructureMutation()   // PUT /preferences/salary-structure
useRsuGrantsMutation()         // PUT /preferences/rsu-grants
useGrowthAssumptionsMutation() // PUT /preferences/growth-assumptions
```

Follow existing pattern: invalidate preferences query on success, update Zustand store.

---

## 4. Frontend: Settings Page — Income & Salary Structure Section

### 4.1 Placement

New section at position 5 (after "Income Classification", before "Financial Settings"):

1. Account Classifications
2. Investment Mappings
3. Expense Categories
4. Income Classification
5. **Income & Salary Structure (NEW)**
6. Financial Settings
7. Display Preferences
8. Notifications
9. Advanced
10. Dashboard Widgets

### 4.2 Component: `SalaryStructureSection.tsx`

Located at `frontend/src/pages/settings/SalaryStructureSection.tsx`

**Sub-sections:**

#### A. Salary Structure (per FY)

- FY selector: left/right arrows + "Add FY" button (pre-fills from growth assumptions if available)
- 2-column grid of labeled inputs: Base Salary (monthly), HRA (monthly, optional), Bonus (annual), EPF (monthly, default 3600), NPS (monthly, default 0), Special Allowance (annual), Other Taxable (annual)
- Live summary card: Total Annual CTC (excluding RSUs), estimated Monthly Take-Home
- Currency symbol from preferences store

#### B. RSU Grants

- "Add Grant" button opens inline form: stock name, price per share, optional grant date and notes
- Each grant renders as a card with:
  - Stock ticker badge + notes
  - Price per share (editable)
  - Vesting table: date, quantity, estimated value (quantity x price, auto-calculated), FY (auto-detected from date)
  - "Add Vesting Date" button per grant
  - Delete per vesting row, delete per grant
  - Total shares and total estimated value in footer

#### C. Growth Assumptions

- 3x2 grid of inputs:
  - Base Salary Growth (%/yr, default 0)
  - Stock Price Appreciation (%/yr, default 0)
  - Projection Horizon (years, default 3, max 5)
  - Bonus Future Years (fixed amount, default 0 — meaning bonus doesn't carry forward)
  - NPS Growth (%/yr, default 0)
  - EPF Scales With Base (toggle, default on)

### 4.3 State Management

Follows existing pattern: `useSettingsState.ts` manages local copies of salary_structure, rsu_grants, and growth_assumptions. Changes are persisted on "Save" via the 3 new PUT endpoints (batched with existing preferences save).

---

## 5. Frontend: Tax Planning Page Enhancement

### 5.1 FY Navigation Extension

The existing FY left/right arrows currently only navigate historical FYs (where transaction data exists). Change:

- **Allow navigating forward** up to `projection_years` FYs past the current FY
- When a future FY is selected and salary structure exists: automatically enter projection mode
- When the current FY is selected and salary structure exists: show toggle between "From Transactions" / "From Salary Structure"
- When no salary structure exists for a FY: show prompt to configure in Settings

### 5.2 Projection Data Source Toggle

Pill-style toggle at top of the tax calculation section:

- **"From Transactions"** (default for current/past FY): existing behavior, unchanged
- **"From Salary Structure"**: calculates tax from salary_structure + RSU vestings for that FY
- **"Projection"** (auto-selected for future FYs): same as salary structure but label indicates forward-looking

### 5.3 Salary-Based Tax Breakdown (current FY)

When "From Salary Structure" is active, replace the income classification breakdown with:

**Left panel — Income Components:**
- Base Salary (annual)
- Bonus & Extras
- RSU Vesting (shares x price, with share count annotation)
- EPF (negative, deducted)
- NPS (if applicable)
- Special Allowance
- Other Taxable
- **Gross Taxable Income** (sum)
- Less: Standard Deduction
- **Net Taxable Income**

**Right panel — Tax Computation** (existing slab breakdown, unchanged logic):
- Tax on slabs
- Section 87A Rebate
- Surcharge
- Health & Education Cess (4%)
- Professional Tax
- **Total Projected Tax**
- Effective Tax Rate
- Monthly TDS (approx)

**TDS Progress Bar** (current FY only):
- Compare projected tax vs actual tax paid so far (from transaction data classified as taxable)
- Show percentage paid, remaining amount, remaining months

### 5.4 Multi-Year Comparison Table

Collapsible section below the main tax view. Visible when salary structure + growth assumptions are configured.

**Table structure:**
- One column per projected FY
- Rows: Base Salary, Bonus, RSU Vesting (with share count), EPF, Other, Gross Taxable, Standard Deduction, Net Taxable, Total Tax, Annual Take-Home, Monthly Take-Home
- Growth annotations per cell (+10%, "scaled", "not set")
- Color coding: income green, tax red, take-home purple

**Grouped bar chart** (Recharts):
- Three bars per FY: Gross Income, Tax, Take-Home
- Wrapped in ChartContainer per existing pattern

### 5.5 Projection Insights

Added to existing suggestions section. Contextual based on projection data:

- **Missing data warnings**: "Bonus not set for FY 2027-28 — take-home projection may be understated"
- **Slab jump alerts**: "RSU vesting in FY 2028-29 pushes income into 20% slab — consider NPS 80CCD(2)"
- **Tax-saving suggestions**: "Employer NPS contribution could save up to X/yr" (calculated from actual numbers)
- **YoY comparison**: "Effective tax rate increases from 11.5% to 13.2% over projection period"

---

## 6. Frontend: Projection Logic

### 6.1 New Module: `frontend/src/lib/projectionCalculator.ts`

Pure functions that take salary structure, RSU grants, growth assumptions, and produce per-FY projections.

```typescript
// Core projection function
function projectFiscalYear(
  baseFY: string,                        // The FY with user-defined salary
  targetFY: string,                      // The FY to project
  salaryStructure: Record<string, SalaryComponents>,
  rsuGrants: RsuGrant[],
  growthAssumptions: GrowthAssumptions,
  fiscalYearStartMonth: number,
): ProjectedFYBreakdown

// Multi-year projection
function projectMultipleYears(
  salaryStructure: Record<string, SalaryComponents>,
  rsuGrants: RsuGrant[],
  growthAssumptions: GrowthAssumptions,
  fiscalYearStartMonth: number,
): ProjectedFYBreakdown[]

// RSU vestings grouped by FY
function getRsuVestingsByFY(
  rsuGrants: RsuGrant[],
  fiscalYearStartMonth: number,
  stockAppreciationPct: number,
  yearsFromBase: number,
): Record<string, { shares: number; value: number; details: VestingDetail[] }>
```

**Projection algorithm for a future FY (N years from base):**

1. Start from the most recent FY with explicit salary data (base FY)
2. Apply `base_salary_growth_pct` compounding: `base * (1 + rate/100)^N`
3. HRA: if set, scale proportionally with base
4. Bonus: if `bonus_growth_pct` is 0, set to 0 for future years (one-time). If > 0, apply growth.
5. EPF: if `epf_scales_with_base`, recalculate as `epf_monthly * (new_base / old_base)`. Otherwise keep same.
6. NPS: apply `nps_growth_pct` compounding
7. RSU vestings: sum all vestings falling within that FY's date range, multiply quantity by `stock_price * (1 + appreciation/100)^N`
8. Other taxable: carry forward unchanged
9. Compute gross taxable, apply standard deduction, run through existing `calculateTax()` from taxCalculator.ts
10. Return full breakdown with component values, tax computation, and take-home

### 6.2 Integration with Existing `taxCalculator.ts`

No changes to existing functions. `projectionCalculator.ts` calls `calculateTax()` and `getTaxSlabs()` as-is. This keeps the tax logic single-sourced.

---

## 7. Testing Strategy

### 7.1 Backend

- **Unit tests** for Pydantic schema validation (salary components, RSU grants with edge cases like empty vestings)
- **Integration tests** for the 3 new PUT endpoints (happy path, validation errors, partial updates)
- **Migration test**: verify columns exist with correct defaults after migration

### 7.2 Frontend

- **Unit tests** for `projectionCalculator.ts`: growth compounding, RSU FY grouping, edge cases (0% growth, no RSUs, missing FY data)
- **Hook tests** for the 3 new mutations (mock API calls)
- **Component rendering**: SalaryStructureSection renders correctly with empty state, populated state

---

## 8. File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `backend/src/ledger_sync/schemas/salary.py` | Pydantic models for salary, RSU, growth |
| `backend/alembic/versions/xxx_add_salary_structure.py` | Migration adding 3 JSON columns |
| `frontend/src/types/salary.ts` | TypeScript interfaces |
| `frontend/src/lib/projectionCalculator.ts` | Projection computation (pure functions) |
| `frontend/src/pages/settings/SalaryStructureSection.tsx` | Settings UI section |

### Modified Files
| File | Changes |
|------|---------|
| `backend/src/ledger_sync/db/models.py` | Add 3 JSON columns to UserPreferences |
| `backend/src/ledger_sync/api/preferences.py` | Add 3 PUT endpoints |
| `backend/src/ledger_sync/schemas/preferences.py` | Extend response model |
| `frontend/src/store/preferencesStore.ts` | Add salary/RSU/growth state + actions |
| `frontend/src/pages/SettingsPage.tsx` | Import and render SalaryStructureSection |
| `frontend/src/pages/settings/useSettingsState.ts` | Manage local salary/RSU/growth state |
| `frontend/src/pages/settings/types.ts` | Add salary-related constants |
| `frontend/src/pages/TaxPlanningPage.tsx` | FY nav extension, projection toggle, multi-year table, insights |
| `frontend/src/services/api/preferences.ts` | Add 3 API call functions |
| `frontend/src/hooks/api/usePreferences.ts` | Add 3 mutation hooks |

### Test Files
| File | Purpose |
|------|---------|
| `backend/tests/unit/test_salary_schemas.py` | Pydantic validation tests |
| `backend/tests/integration/test_salary_preferences.py` | API endpoint tests |
| `frontend/src/lib/__tests__/projectionCalculator.test.ts` | Projection logic tests |
