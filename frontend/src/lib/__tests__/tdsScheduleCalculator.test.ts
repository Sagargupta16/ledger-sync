import { describe, expect, it } from 'vitest'
import { buildTdsSchedule, type TdsScheduleParams } from '../tdsScheduleCalculator'
import { getTaxSlabs, getStandardDeduction, calculateTax } from '../taxCalculator'

const FY = 2025
const slabs = getTaxSlabs(FY, 'new')
const standardDeduction = getStandardDeduction(FY)

function makeParams(overrides: Partial<TdsScheduleParams> = {}): TdsScheduleParams {
  return {
    regularMonthlyIncome: 100000, // 12L/yr regular
    extraByMonth: {},
    fyStartMonth: 4, // April
    slabs,
    standardDeduction,
    isNewRegime: true,
    fyStartYear: FY,
    ...overrides,
  }
}

describe('buildTdsSchedule', () => {
  it('returns 12 rows labelled from the FY start month', () => {
    const rows = buildTdsSchedule(makeParams())
    expect(rows).toHaveLength(12)
    expect(rows[0].month).toBe('Apr')
    expect(rows[11].month).toBe('Mar')
  })

  it('spreads TDS evenly when income is flat (no extras)', () => {
    const rows = buildTdsSchedule(makeParams())
    const first = rows[0].monthlyTds
    // Every month deducts the same amount when nothing revises the projection.
    for (const r of rows) {
      expect(r.monthlyTds).toBeCloseTo(first, 2)
    }
    // Cumulative TDS by year-end equals the full annual tax on 12L.
    const annual = calculateTax(1_200_000, slabs, standardDeduction, true, 12, true, FY).totalTax
    expect(rows[11].cumulativeTds).toBeCloseTo(annual, 0)
  })

  it('projects only the regular salary before any extra lands', () => {
    const rows = buildTdsSchedule(makeParams({ extraByMonth: { 4: 500000 } })) // RSU in Sep (index 4)
    // Apr-Aug (indices 0-3) project regular-only 12L.
    expect(rows[0].projectedAnnual).toBe(1_200_000)
    expect(rows[3].projectedAnnual).toBe(1_200_000)
    // Sep (index 4) folds in the 5L extra -> 17L.
    expect(rows[4].projectedAnnual).toBe(1_700_000)
    // And stays there for the rest of the year.
    expect(rows[11].projectedAnnual).toBe(1_700_000)
  })

  it('spikes TDS the month an extra (RSU/bonus) lands, then returns to baseline', () => {
    const rows = buildTdsSchedule(makeParams({ extraByMonth: { 4: 500000 } }))
    const beforeSpike = rows[3].monthlyTds // Aug -- flat baseline
    const spike = rows[4].monthlyTds // Sep -- extra lands, marginal tax added
    const afterSpike = rows[5].monthlyTds // Oct -- back to flat baseline
    expect(spike).toBeGreaterThan(beforeSpike * 2)
    // Regular-salary TDS is a flat baseline: months without an extra are equal.
    expect(afterSpike).toBeCloseTo(beforeSpike, 2)
    expect(spike).toBeGreaterThan(afterSpike)
  })

  it('cumulative TDS equals the full-year tax on total income', () => {
    const rows = buildTdsSchedule(makeParams({ extraByMonth: { 4: 500000 } }))
    const annual = calculateTax(1_700_000, slabs, standardDeduction, true, 12, true, FY).totalTax
    expect(rows[11].cumulativeTds).toBeCloseTo(annual, 0)
  })

  it('take-home equals income minus TDS each month', () => {
    const rows = buildTdsSchedule(makeParams())
    for (const r of rows) {
      expect(r.takeHome).toBeCloseTo(r.monthIncome - r.monthlyTds, 2)
    }
  })

  it('never deducts negative TDS', () => {
    // Old regime, lower income -> still must never go negative.
    const rows = buildTdsSchedule(
      makeParams({ regularMonthlyIncome: 50000, isNewRegime: false, slabs: getTaxSlabs(FY, 'old') }),
    )
    for (const r of rows) {
      expect(r.monthlyTds).toBeGreaterThanOrEqual(0)
    }
  })
})
