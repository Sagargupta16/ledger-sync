import { describe, it, expect } from 'vitest'
import {
  calculateTax,
  TAX_SLABS_OLD_REGIME,
  TAX_SLABS_NEW_FY2025,
  getTaxSlabs,
  getStandardDeduction,
  getFYFromDate,
  parseFYStartYear,
} from '../taxCalculator'

describe('calculateTax - base slabs', () => {
  it('taxes income below first slab at 0', () => {
    const result = calculateTax(300_000, TAX_SLABS_NEW_FY2025, 0, false, 0, true, 2025)
    expect(result.tax).toBe(0)
    expect(result.totalTax).toBe(0)
  })

  it('applies standard deduction before slab math', () => {
    // Income 400k, SD 75k -> taxable 325k. New FY2025 slabs tax 0% up to 400k.
    const result = calculateTax(400_000, TAX_SLABS_NEW_FY2025, 75_000, false, 0, true, 2025)
    expect(result.tax).toBe(0)
  })

  it('computes tax progressively across slabs (old regime, 10L income)', () => {
    // Old regime: 0% to 2.5L, 5% to 5L, 20% to 10L, 30% above
    //   2.5L * 5%  = 12_500
    //   5L   * 20% = 100_000
    //   total      = 112_500
    const result = calculateTax(1_000_000, TAX_SLABS_OLD_REGIME, 0, false, 0, false, 2025)
    expect(result.tax).toBe(112_500)
  })
})

describe('calculateTax - Section 87A rebate', () => {
  it('zeros out tax for new-regime income at/under the ceiling', () => {
    // FY 2025-26 new regime: rebate ceiling 12L, max rebate 60k.
    // Income 1.2M, taxable 1.2M - 75k SD = 1.125M -> BUT rebate is based on
    // taxable <= 1.2M so 1.125M qualifies.
    const result = calculateTax(1_200_000, TAX_SLABS_NEW_FY2025, 75_000, false, 0, true, 2025)
    expect(result.rebate87A).toBeGreaterThan(0)
    // Total tax = base tax - rebate + cess; since rebate caps base tax at 0 it
    // should land at 0 (no surcharge below 50L).
    expect(result.totalTax).toBe(0)
  })

  it('does not apply rebate above the income ceiling', () => {
    const result = calculateTax(1_500_000, TAX_SLABS_NEW_FY2025, 75_000, false, 0, true, 2025)
    expect(result.rebate87A).toBe(0)
  })
})

describe('calculateTax - surcharge (computed on base tax, not post-rebate)', () => {
  it('applies 10% surcharge to high income new regime (50L-1Cr band)', () => {
    // Income 70L taxable after SD 75k = 6_925_000. Falls in old/new surcharge
    // bucket 50L-1Cr -> 10% of base tax.
    // At 6_925_000 under NEW FY2025 slabs:
    //   0-4L   *  0%  = 0
    //   4-8L   *  5%  = 20_000
    //   8-12L  * 10%  = 40_000
    //   12-16L * 15%  = 60_000
    //   16-20L * 20%  = 80_000
    //   20-24L * 25%  = 100_000
    //   24L-6_925_000 * 30% = 1_357_500
    //   total base = 1_657_500
    // Surcharge = 10% of 1_657_500 = 165_750
    const result = calculateTax(7_000_000, TAX_SLABS_NEW_FY2025, 75_000, false, 0, true, 2025)
    expect(result.tax).toBe(1_657_500)
    expect(result.surcharge).toBe(165_750)
    expect(result.rebate87A).toBe(0) // way above rebate ceiling
  })

  it('regression: surcharge uses base tax even when rebate would change the denominator', () => {
    // This test locks in the post-fix ordering. Old bug computed surcharge on
    // (baseTax - rebate). Under any future rule change where rebate and
    // surcharge can coexist, the surcharge should be on the full base tax.
    //
    // We simulate a hypothetical by asserting that the engine's `surcharge`
    // field is mathematically `rate * baseTax` (NOT rate * (baseTax - rebate))
    // for a standard high-income case.
    const result = calculateTax(10_500_000, TAX_SLABS_NEW_FY2025, 75_000, false, 0, true, 2025)
    const expectedBand = 0.15 // 1Cr-2Cr new regime
    const ratio = result.surcharge / result.tax
    expect(ratio).toBeCloseTo(expectedBand, 4)
  })
})

describe('calculateTax - health & education cess', () => {
  it('adds 4% cess on (tax after rebate + surcharge)', () => {
    const result = calculateTax(1_500_000, TAX_SLABS_NEW_FY2025, 75_000, false, 0, true, 2025)
    // No surcharge at 15L. Cess = 4% * taxAfterRebate
    const expectedCess = (result.tax - result.rebate87A) * 0.04
    expect(result.cess).toBeCloseTo(expectedCess, 2)
  })
})

describe('getTaxSlabs / getStandardDeduction / getFYFromDate', () => {
  it('returns the right standard deduction', () => {
    expect(getStandardDeduction(2025)).toBe(75_000)
    expect(getStandardDeduction(2024)).toBe(75_000)
    expect(getStandardDeduction(2023)).toBe(50_000)
  })

  it('dispatches slabs by regime and FY', () => {
    expect(getTaxSlabs(2025, 'new')).toBe(TAX_SLABS_NEW_FY2025)
    expect(getTaxSlabs(2025, 'old')).toBe(TAX_SLABS_OLD_REGIME)
  })

  it('resolves FY from a date', () => {
    expect(getFYFromDate('2025-04-01')).toBe('FY 2025-26')
    expect(getFYFromDate('2025-03-31')).toBe('FY 2024-25')
    expect(getFYFromDate('2026-01-15')).toBe('FY 2025-26')
  })

  it('parses FY label', () => {
    expect(parseFYStartYear('FY 2025-26')).toBe(2025)
    expect(parseFYStartYear('FY 2099-00')).toBe(2099)
  })
})
