import { describe, expect, it } from 'vitest'

import { getAnnualFactor, toMonthlyAmount } from '../helpers'

/**
 * The subscription tracker's KPI row sums `toMonthlyAmount` over every live
 * commitment. Its local annualization switch had no `daily` case, so a daily
 * charge hit `default: 12` and every "Monthly Expense" figure that included one
 * was understated by 365/12 (~30x).
 *
 * The switch is gone -- these now assert against the shared table in
 * `@/lib/recurrenceFrequency` through this page's re-export, which is the seam
 * the page's components actually import.
 */

/** Round per-occurrence amount so every expected product is exact. */
const PER_OCCURRENCE = 50
const DAYS_PER_YEAR = 365
const MONTHS_PER_YEAR = 12

describe('getAnnualFactor', () => {
  it('annualizes a daily charge at 365, not 12', () => {
    expect(getAnnualFactor('daily')).toBe(DAYS_PER_YEAR)
    expect(getAnnualFactor('daily')).not.toBe(MONTHS_PER_YEAR)
  })

  it('preserves the factors the page already relied on', () => {
    expect(getAnnualFactor('weekly')).toBe(52)
    expect(getAnnualFactor('fortnightly')).toBe(26)
    expect(getAnnualFactor('biweekly')).toBe(26)
    expect(getAnnualFactor('monthly')).toBe(12)
    expect(getAnnualFactor('bimonthly')).toBe(6)
    expect(getAnnualFactor('quarterly')).toBe(4)
    expect(getAnnualFactor('semiannual')).toBe(2)
    expect(getAnnualFactor('yearly')).toBe(1)
    expect(getAnnualFactor('annually')).toBe(1)
  })

  it('still defaults to monthly for unknown or missing input', () => {
    expect(getAnnualFactor(null)).toBe(MONTHS_PER_YEAR)
    expect(getAnnualFactor('hourly')).toBe(MONTHS_PER_YEAR)
  })
})

describe('toMonthlyAmount', () => {
  it('turns a 50/day subscription into 18,250/year, not 600/year', () => {
    const annual = toMonthlyAmount(PER_OCCURRENCE, 'daily') * MONTHS_PER_YEAR
    expect(annual).toBe(18_250)
    expect(annual).not.toBe(600)
  })

  it('prices a daily charge ~30x a monthly one of the same size', () => {
    const daily = toMonthlyAmount(PER_OCCURRENCE, 'daily')
    const monthly = toMonthlyAmount(PER_OCCURRENCE, 'monthly')
    expect(daily / monthly).toBeCloseTo(DAYS_PER_YEAR / MONTHS_PER_YEAR, 10)
    expect(daily).toBeGreaterThan(monthly * 30)
  })

  it('is casing-insensitive without the call site lowercasing', () => {
    expect(toMonthlyAmount(PER_OCCURRENCE, 'DAILY')).toBe(
      toMonthlyAmount(PER_OCCURRENCE, 'daily'),
    )
  })

  it('sums a mixed-cadence commitment list at the right total', () => {
    // One daily + one monthly + one yearly charge, all the same face amount.
    const rows = [
      { expected_amount: PER_OCCURRENCE, frequency: 'daily' },
      { expected_amount: PER_OCCURRENCE, frequency: 'monthly' },
      { expected_amount: PER_OCCURRENCE, frequency: 'yearly' },
    ]
    const total = rows.reduce((sum, r) => sum + toMonthlyAmount(r.expected_amount, r.frequency), 0)
    const expected =
      (PER_OCCURRENCE * DAYS_PER_YEAR) / MONTHS_PER_YEAR +
      PER_OCCURRENCE +
      PER_OCCURRENCE / MONTHS_PER_YEAR
    expect(total).toBeCloseTo(expected, 10)
    // With the defect, all three read as `PER_OCCURRENCE`-ish and the total
    // collapsed to about 104 instead of about 1,575.
    expect(total).toBeGreaterThan(1_500)
  })
})
