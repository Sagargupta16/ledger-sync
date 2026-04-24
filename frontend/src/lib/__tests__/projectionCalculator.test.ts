import { describe, expect, it } from 'vitest'
import {
  getRsuVestingsByFY,
  projectFiscalYear,
  projectMultipleYears,
} from '../projectionCalculator'
import type { SalaryComponents, RsuGrant, GrowthAssumptions } from '@/types/salary'
import { DEFAULT_GROWTH_ASSUMPTIONS } from '@/types/salary'

const baseSalary: SalaryComponents = {
  base_salary_annual: 960000,
  hra_annual: null,
  bonus_annual: 200000,
  epf_monthly: 3600,
  nps_monthly: 0,
  special_allowance_annual: 0,
  other_taxable_annual: 50000,
}

const testGrant: RsuGrant = {
  id: 'g1',
  stock_name: 'AMZN',
  stock_price: 100,
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
    expect(result['2025-26']).toBeDefined()
    expect(result['2025-26'].shares).toBe(25)
    expect(result['2025-26'].value).toBe(2500)
    expect(result['2026-27'].shares).toBe(25)
    expect(result['2027-28'].shares).toBe(30)
    expect(result['2027-28'].value).toBe(3000)
  })

  it('applies stock appreciation', () => {
    const result = getRsuVestingsByFY([testGrant], 4, 10, 2025)
    expect(result['2025-26'].value).toBe(2500)
    expect(result['2026-27'].value).toBeCloseTo(25 * 110, 0)
    expect(result['2027-28'].value).toBeCloseTo(30 * 121, 0)
  })

  it('returns empty for no grants', () => {
    const result = getRsuVestingsByFY([], 4, 0)
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('formats FY strings correctly across the year-2100 boundary (regression test)', () => {
    // Old code used `(year + 1) % 100` which formatted FY 2099-2100 as
    // "2099-00" (invalid) and would then collide with any other FY whose
    // mod-100 happened to equal 0. Ensure the wrap is handled cleanly.
    const futureGrant: RsuGrant = {
      id: 'g-future',
      stock_name: 'FUT',
      stock_price: 1,
      grant_date: null,
      notes: null,
      vestings: [
        { date: '2099-06-15', quantity: 1 }, // FY 2099 -> "2099-00"
        { date: '2100-06-15', quantity: 1 }, // FY 2100 -> "2100-01"
      ],
    }
    const result = getRsuVestingsByFY([futureGrant], 4, 0)
    expect(result['2099-00']).toBeDefined()
    expect(result['2100-01']).toBeDefined()
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
    expect(result.baseSalary).toBe(960000)
    expect(result.bonus).toBe(200000)
    expect(result.epf).toBe(43200)
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
    expect(result.baseSalary).toBeCloseTo(1056000, 0)
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
    expect(result.epf).toBeCloseTo(47520, 0)
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
    expect(result.rsuIncome).toBe(2500)
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
    expect(results).toHaveLength(4)
  })

  it('returns empty array when no salary structure', () => {
    const results = projectMultipleYears({}, [], DEFAULT_GROWTH_ASSUMPTIONS, 4)
    expect(results).toHaveLength(0)
  })
})
