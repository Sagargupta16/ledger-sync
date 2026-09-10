import { describe, expect, it } from 'vitest'
import { buildTaxRateCurve, effectiveTaxRate } from '../taxRateCurve'

describe('tax rate curves share eligibility with the tax plan', () => {
  it('does not apply the salary deduction to business income', () => {
    expect(effectiveTaxRate(1_500_000, 2026, 'new', false)).toBeCloseTo(7.28, 5)
    expect(effectiveTaxRate(3_000_000, 2026, 'new', true)).toBeCloseTo(15.94, 5)
    expect(buildTaxRateCurve(1_500_000, 2026, false).points.at(-1)?.newRegimeRate).toBe(7.28)
  })

  it('keeps FY 2019 old-regime rates without relabeling them as new-regime data', () => {
    const curve = buildTaxRateCurve(3_000_000, 2019, true)
    expect(curve.newRegimeAvailable).toBe(false)
    expect(curve.points.every((point) => point.newRegimeRate === undefined)).toBe(true)
    expect(curve.points[0].oldRegimeRate).toBe(0)
    expect(curve.points.at(-1)?.oldRegimeRate).toBe(24.26)
  })

  it('includes both regimes from FY 2020 onward', () => {
    const curve = buildTaxRateCurve(3_000_000, 2020, true)
    expect(curve.newRegimeAvailable).toBe(true)
    expect(curve.points.every((point) => point.newRegimeRate !== undefined)).toBe(true)
    expect(curve.points.at(-1)?.newRegimeRate).not.toBe(curve.points.at(-1)?.oldRegimeRate)
    expect(curve.points.at(-1)?.oldRegimeRate).toBe(24.26)
  })
})
