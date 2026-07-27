import { describe, expect, it } from 'vitest'

import {
  adaptApiRecurring,
  checkIsActive,
  classifyFrequency,
  computeExpectedNextDate,
  stalenessWindowDays,
  sumMonthlyCommitment,
} from '@/components/analytics/recurringUtils'
import type { RecurringTransaction as ApiRecurringTransaction } from '@/services/api/analyticsV2'

/**
 * The adapter used to collapse the backend's eight frequency bands into three
 * display buckets via an UPPERCASE lookup table. `daily` had no entry, so it
 * fell through to `'monthly'` and the "Monthly Fixed Costs" total charged a
 * daily commitment once a month -- 365/12 (~30x) too cheap.
 *
 * Every case injects dates explicitly; nothing here reads the real clock.
 */

const PER_OCCURRENCE = 50
const DAYS_PER_YEAR = 365
const MONTHS_PER_YEAR = 12

function apiRow(overrides: Partial<ApiRecurringTransaction> = {}): ApiRecurringTransaction {
  return {
    id: 1,
    name: 'Test pattern',
    category: 'Test category',
    subcategory: null,
    account: 'Test account',
    type: 'Expense',
    frequency: 'monthly',
    expected_amount: PER_OCCURRENCE,
    variance: 0,
    expected_day: 1,
    confidence: 90,
    occurrences: 10,
    last_occurrence: '2026-07-01',
    next_expected: '2026-08-01',
    times_missed: 0,
    is_active: true,
    is_confirmed: false,
    pattern_kind: 'commitment',
    ...overrides,
  }
}

describe('adaptApiRecurring', () => {
  it('keeps daily as daily instead of collapsing it to monthly', () => {
    const [row] = adaptApiRecurring([apiRow({ frequency: 'daily' })])
    expect(row.frequency).toBe('daily')
  })

  it('prices a daily commitment at 365/12 of its face amount per month', () => {
    const [row] = adaptApiRecurring([apiRow({ frequency: 'daily' })])
    expect(row.monthlyAmount).toBeCloseTo((PER_OCCURRENCE * DAYS_PER_YEAR) / MONTHS_PER_YEAR, 10)
    expect(row.monthlyAmount * MONTHS_PER_YEAR).toBe(18_250)
    expect(row.monthlyAmount).not.toBe(PER_OCCURRENCE)
  })

  it('preserves each backend band rather than bucketing it', () => {
    const bands = [
      'daily',
      'weekly',
      'biweekly',
      'monthly',
      'bimonthly',
      'quarterly',
      'semiannual',
      'yearly',
    ] as const
    for (const band of bands) {
      const [row] = adaptApiRecurring([apiRow({ frequency: band })])
      expect(row.frequency, `"${band}" was rewritten`).toBe(band)
    }
  })

  it('accepts uppercase frequencies from the API without a call-site fixup', () => {
    const [row] = adaptApiRecurring([apiRow({ frequency: 'DAILY' })])
    expect(row.frequency).toBe('daily')
    expect(row.monthlyAmount).toBeCloseTo((PER_OCCURRENCE * DAYS_PER_YEAR) / MONTHS_PER_YEAR, 10)
  })

  it('falls back to monthly for an unrecognized frequency', () => {
    const [row] = adaptApiRecurring([apiRow({ frequency: null })])
    expect(row.frequency).toBe('monthly')
    expect(row.monthlyAmount).toBe(PER_OCCURRENCE)
  })

  it('drops income patterns so the commitment total stays expense-only', () => {
    const rows = adaptApiRecurring([
      apiRow({ id: 1, type: 'Income' }),
      apiRow({ id: 2, type: 'Expense' }),
    ])
    expect(rows).toHaveLength(1)
  })
})

describe('sumMonthlyCommitment', () => {
  it('does not understate a mixed-cadence commitment list', () => {
    const rows = adaptApiRecurring([
      apiRow({ id: 1, frequency: 'daily' }),
      apiRow({ id: 2, frequency: 'monthly' }),
      apiRow({ id: 3, frequency: 'yearly' }),
    ])
    const expected =
      (PER_OCCURRENCE * DAYS_PER_YEAR) / MONTHS_PER_YEAR +
      PER_OCCURRENCE +
      PER_OCCURRENCE / MONTHS_PER_YEAR
    expect(sumMonthlyCommitment(rows)).toBeCloseTo(expected, 10)
    // The old three-branch chain divided anything non-monthly/quarterly by 12,
    // so this list summed to about 104 rather than about 1,575.
    expect(sumMonthlyCommitment(rows)).toBeGreaterThan(1_500)
  })

  it('is zero for an empty list', () => {
    expect(sumMonthlyCommitment([])).toBe(0)
  })
})

describe('classifyFrequency', () => {
  it('classifies a one-day cadence as daily instead of dropping it', () => {
    expect(classifyFrequency(1)).toBe('daily')
    expect(classifyFrequency(2)).toBe('daily')
  })

  it('covers the bands the three hardcoded windows used to skip', () => {
    expect(classifyFrequency(7)).toBe('weekly')
    expect(classifyFrequency(14)).toBe('biweekly')
    expect(classifyFrequency(30)).toBe('monthly')
    expect(classifyFrequency(61)).toBe('bimonthly')
    expect(classifyFrequency(91)).toBe('quarterly')
    expect(classifyFrequency(182)).toBe('semiannual')
    expect(classifyFrequency(365)).toBe('yearly')
  })

  it('leaves no dead gap between adjacent bands', () => {
    // The old windows (25-38, 80-105, 345-385) dropped everything in between.
    for (let interval = 1; interval < 400; interval++) {
      expect(classifyFrequency(interval), `interval ${interval} classified as null`).not.toBeNull()
    }
  })

  it('rejects cadences outside the detectable range', () => {
    expect(classifyFrequency(0)).toBeNull()
    expect(classifyFrequency(400)).toBeNull()
    expect(classifyFrequency(1_000)).toBeNull()
  })
})

describe('computeExpectedNextDate', () => {
  it('steps a daily pattern forward one day, not one year', () => {
    const next = computeExpectedNextDate(new Date(2026, 6, 26), 'daily')
    expect(next).toEqual(new Date(2026, 6, 27))
  })

  it('steps a weekly pattern forward one week', () => {
    expect(computeExpectedNextDate(new Date(2026, 6, 26), 'weekly')).toEqual(new Date(2026, 7, 2))
  })

  it('keeps the pre-existing month strides', () => {
    expect(computeExpectedNextDate(new Date(2026, 6, 15), 'monthly')).toEqual(new Date(2026, 7, 15))
    expect(computeExpectedNextDate(new Date(2026, 6, 15), 'quarterly')).toEqual(
      new Date(2026, 9, 15),
    )
    expect(computeExpectedNextDate(new Date(2026, 6, 15), 'yearly')).toEqual(new Date(2027, 6, 15))
  })
})

describe('checkIsActive', () => {
  it('calls a daily pattern seen yesterday active', () => {
    expect(checkIsActive(new Date(2026, 6, 25), 'daily', new Date(2026, 6, 26))).toBe(true)
  })

  it('calls a daily pattern silent for a month dormant', () => {
    expect(checkIsActive(new Date(2026, 5, 26), 'daily', new Date(2026, 6, 26))).toBe(false)
  })

  it('gives every frequency a real threshold, not undefined', () => {
    // `maxDaysMap` had only monthly/quarterly/yearly keys, so every other
    // frequency compared against `undefined` and read as inactive always.
    const bands = [
      'daily',
      'weekly',
      'biweekly',
      'monthly',
      'bimonthly',
      'quarterly',
      'semiannual',
      'yearly',
    ] as const
    for (const band of bands) {
      expect(Number.isFinite(stalenessWindowDays(band)), `no window for "${band}"`).toBe(true)
      // Seen today: active under every cadence.
      expect(checkIsActive(new Date(2026, 6, 26), band, new Date(2026, 6, 26))).toBe(true)
    }
  })

  it('keeps the established monthly and yearly grace periods', () => {
    expect(stalenessWindowDays('monthly')).toBe(45)
    expect(stalenessWindowDays('quarterly')).toBe(120)
    expect(stalenessWindowDays('yearly')).toBe(400)
  })
})
