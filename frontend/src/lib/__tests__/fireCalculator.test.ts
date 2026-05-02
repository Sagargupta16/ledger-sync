import { describe, it, expect } from 'vitest'
import {
  computeFIRENumber,
  computeCoastFIRE,
  computeLeanFIRE,
  computeFatFIRE,
  computeBaristaFIRE,
  computeYearsToFIRE,
  computeFIRE,
  computeRetirementCorpus,
} from '../fireCalculator'

describe('computeFIRENumber', () => {
  it('divides annual expenses by SWR', () => {
    expect(computeFIRENumber(600000, 0.03)).toBe(20_000_000)
    expect(computeFIRENumber(1200000, 0.04)).toBe(30_000_000)
  })

  it('returns 0 for zero or negative SWR', () => {
    expect(computeFIRENumber(600000, 0)).toBe(0)
    expect(computeFIRENumber(600000, -0.01)).toBe(0)
  })
})

describe('computeCoastFIRE', () => {
  it('discounts FIRE number back to today via compound growth', () => {
    // 1 Cr needed in 20 years at 7% real return => ~25.84 L today
    expect(computeCoastFIRE(10_000_000, 0.07, 20)).toBe(2_584_190)
  })

  it('returns FIRE number itself when retiring today', () => {
    expect(computeCoastFIRE(10_000_000, 0.07, 0)).toBe(10_000_000)
  })
})

describe('computeLeanFIRE / computeFatFIRE', () => {
  it('lean uses essential expenses only', () => {
    expect(computeLeanFIRE(360000, 0.03)).toBe(12_000_000)
  })

  it('fat is 2x FIRE number', () => {
    expect(computeFatFIRE(20_000_000)).toBe(40_000_000)
  })
})

describe('computeBaristaFIRE', () => {
  it('equals full FIRE when barista income is zero', () => {
    // 6L expenses at 3% SWR = 2Cr, same as computeFIRENumber
    expect(computeBaristaFIRE(600_000, 0, 0.03)).toBe(20_000_000)
  })

  it('shrinks the required corpus by the covered income', () => {
    // 6L expenses, 2L/yr covered by barista work => only need 4L/yr from
    // the portfolio. At 3% SWR that is 1.333Cr, significantly less than 2Cr.
    expect(computeBaristaFIRE(600_000, 200_000, 0.03)).toBe(13_333_333)
  })

  it('clamps to zero when barista income fully covers expenses', () => {
    // Part-time income >= expenses -> no portfolio needed
    expect(computeBaristaFIRE(600_000, 700_000, 0.03)).toBe(0)
  })

  it('returns 0 for zero / negative SWR (undefined division)', () => {
    expect(computeBaristaFIRE(600_000, 100_000, 0)).toBe(0)
    expect(computeBaristaFIRE(600_000, 100_000, -0.01)).toBe(0)
  })
})

describe('computeYearsToFIRE', () => {
  it('returns 0 when already at FIRE', () => {
    expect(computeYearsToFIRE(10_000_000, 500000, 0.07, 10_000_000)).toBe(0)
    expect(computeYearsToFIRE(10_000_000, 500000, 0.07, 15_000_000)).toBe(0)
  })

  it('computes years from zero portfolio via savings alone', () => {
    // Save 10L/year at 7% real return, target 1Cr
    //   solve: 10L * [((1.07)^n - 1) / 0.07] = 1Cr
    //   (1.07)^n - 1 = 0.7   =>  n = log(1.7)/log(1.07) ≈ 7.84
    const years = computeYearsToFIRE(10_000_000, 1_000_000, 0.07, 0)
    expect(years).toBeCloseTo(7.84, 1)
  })

  it('compounds existing portfolio for ALL years, not just 1 (regression test)', () => {
    // 50L today, 10L/year savings at 7% real, target 1Cr
    //   savings perpetuity = 10L/0.07 = 142.86L
    //   ratio = (100L + 142.86L) / (50L + 142.86L) = 242.86/192.86 ≈ 1.2593
    //   n = log(1.2593)/log(1.07) ≈ 3.41
    const years = computeYearsToFIRE(10_000_000, 1_000_000, 0.07, 5_000_000)
    expect(years).toBeCloseTo(3.41, 1)

    // Previously (buggy) code gave target = 100L - 50L * 1.07 = 46.5L
    // then fvFactor = (46.5L * 0.07 / 10L) + 1 = 1.3255
    // n = log(1.3255)/log(1.07) ≈ 4.17
    // So the new (correct) answer must be noticeably lower than 4.17
    expect(years).toBeLessThan(4.0)
  })

  it('handles zero return: linear savings', () => {
    // Target 1Cr, 10L savings, 0% return, 20L existing => 80L gap / 10L = 8 years
    expect(computeYearsToFIRE(10_000_000, 1_000_000, 0, 2_000_000)).toBe(8)
  })

  it('handles zero savings: pure compounding', () => {
    // Target 1Cr, 50L existing, 7% real return
    //   (1.07)^n = 2  =>  n = log(2)/log(1.07) ≈ 10.24
    expect(computeYearsToFIRE(10_000_000, 0, 0.07, 5_000_000)).toBeCloseTo(10.24, 1)
  })

  it('returns Infinity when savings and return are both zero/negative', () => {
    expect(computeYearsToFIRE(10_000_000, 0, 0, 0)).toBe(Infinity)
    expect(computeYearsToFIRE(10_000_000, 0, -0.01, 0)).toBe(Infinity)
  })
})

describe('computeFIRE orchestrator', () => {
  it('returns all variants', () => {
    const result = computeFIRE({
      annualExpenses: 600000,
      essentialAnnualExpenses: 360000,
      annualSavings: 500000,
      annualIncome: 1500000,
      currentPortfolio: 0,
      swr: 0.03,
      realReturn: 0.07,
      yearsToRetire: 25,
    })
    expect(result.fireNumber).toBe(20_000_000)
    expect(result.leanFIRE).toBe(12_000_000)
    expect(result.fatFIRE).toBe(40_000_000)
    // With no barista income, baristaFIRE equals standard FIRE.
    expect(result.baristaFIRE).toBe(20_000_000)
    expect(result.currentSavingsRate).toBeCloseTo(33.33, 1)
    expect(result.yearsToFIRE).toBeGreaterThan(0)
    expect(result.yearsToFIRE).toBeLessThan(Infinity)
  })

  it('shrinks baristaFIRE when barista income is provided', () => {
    const result = computeFIRE({
      annualExpenses: 600000,
      essentialAnnualExpenses: 360000,
      annualSavings: 500000,
      annualIncome: 1500000,
      swr: 0.03,
      realReturn: 0.07,
      yearsToRetire: 25,
      baristaAnnualIncome: 200_000,
    })
    // 4L gap / 3 % SWR = 1.333Cr
    expect(result.baristaFIRE).toBe(13_333_333)
    // Standard FIRE is unaffected by the barista-side input.
    expect(result.fireNumber).toBe(20_000_000)
  })
})

describe('computeRetirementCorpus', () => {
  it('inflates expenses to retirement year', () => {
    const result = computeRetirementCorpus({
      monthlyExpenses: 50000,
      inflationRate: 0.065,
      expectedReturn: 0.12,
      yearsToRetirement: 30,
      swr: 0.03,
    })
    // 50K * (1.065)^30 ≈ 330K/month
    expect(result.monthlyExpenseAtRetirement).toBeGreaterThan(300_000)
    expect(result.monthlyExpenseAtRetirement).toBeLessThan(350_000)
    expect(result.requiredCorpus).toBeGreaterThan(0)
    expect(result.monthlySIP).toBeGreaterThan(0)
    expect(result.projectionData).toHaveLength(30)
  })

  it('returns zeros for non-positive years', () => {
    const result = computeRetirementCorpus({
      monthlyExpenses: 50000,
      yearsToRetirement: 0,
    })
    expect(result.requiredCorpus).toBe(0)
    expect(result.monthlySIP).toBe(0)
    expect(result.projectionData).toEqual([])
  })

  it('uses effective-monthly compounding, not naive r/12 (regression test)', () => {
    // At r=12% effective annual and corpus=1.2Cr the correct monthly rate is
    //   rMonthly = (1.12)^(1/12) - 1 ≈ 0.00948879
    // and FV-annuity-due factor ((1+rm)^360 - 1)/rm * (1+rm) ≈ 3080.97
    //   =>  SIP ≈ 12_000_000 / 3080.97 ≈ 3895.
    //
    // The old buggy code used r/12 = 0.01 which yields fvFactor ≈ 3529.91
    //   =>  SIP ≈ 3400, ~12.7% too low -- a big underestimate for retirement.
    // Lock the CORRECTED SIP (~3895) and ensure we're well above the bug.
    const result = computeRetirementCorpus({
      monthlyExpenses: 30000,
      inflationRate: 0, // keep corpus simple: 30k*12/0.03 = 1.2Cr
      expectedReturn: 0.12,
      yearsToRetirement: 30,
      swr: 0.03,
    })
    expect(result.requiredCorpus).toBe(12_000_000)
    expect(result.monthlySIP).toBeGreaterThan(3880)
    expect(result.monthlySIP).toBeLessThan(3910)
    // Old buggy r/12 path would have given SIP ≈ 3400 -- outside the new band
    expect(result.monthlySIP).toBeGreaterThan(3500)
  })

  it('projection loop ends near the target corpus', () => {
    // Internal consistency: accumulating the computed monthlySIP for
    // yearsToRetirement years at the same monthly rate should converge on
    // requiredCorpus to within rounding (<1% drift). Locks the fact that SIP
    // formula and projection loop use the SAME rate.
    const result = computeRetirementCorpus({
      monthlyExpenses: 50000,
      inflationRate: 0.065,
      expectedReturn: 0.12,
      yearsToRetirement: 30,
      swr: 0.03,
    })
    const finalEntry = result.projectionData.at(-1)
    expect(finalEntry).toBeDefined()
    const driftPct =
      Math.abs((finalEntry?.corpus ?? 0) - result.requiredCorpus) / result.requiredCorpus
    expect(driftPct).toBeLessThan(0.01)
  })

  it('handles zero expected return (no compounding)', () => {
    const result = computeRetirementCorpus({
      monthlyExpenses: 10000,
      inflationRate: 0,
      expectedReturn: 0,
      yearsToRetirement: 10,
      swr: 0.04,
    })
    // Required: 10k*12/0.04 = 3_000_000; monthly SIP over 120 months with no
    // growth is exactly corpus/120 = 25_000
    expect(result.requiredCorpus).toBe(3_000_000)
    expect(result.monthlySIP).toBe(25_000)
  })
})
