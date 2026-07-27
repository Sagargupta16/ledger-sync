import { describe, expect, it } from 'vitest'

import { getBillDaysForMonth, getDailyDays, getDaysInMonth } from '../billDays'
import { buildBillMap } from '../billUtils'
import type { RecurringTransaction } from '@/hooks/api/useAnalyticsV2'

/**
 * The calendar-expansion switch had no branch for `daily`, so a daily bill fell
 * to the `expected_day` fallback and painted ONE dot per month instead of every
 * day -- 30 missing bills and a month total ~30x too low. `bimonthly` and
 * `semiannual` had no branch either and hit the same fallback, landing every
 * month instead of every 2nd / 6th.
 *
 * Months are 0-indexed, matching `Date`. Nothing here reads the real clock.
 */

const PER_OCCURRENCE = 50
const JANUARY = 0
const FEBRUARY = 1
const MARCH = 2
const JULY = 6
const LEAP_YEAR = 2024
const NON_LEAP_YEAR = 2026
const DAYS_IN_JULY = 31
const DAYS_IN_FEBRUARY = 28
const DAYS_IN_LEAP_FEBRUARY = 29
const EXPECTED_DAY = 10

function bill(overrides: Partial<RecurringTransaction> = {}): RecurringTransaction {
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
    expected_day: EXPECTED_DAY,
    confidence: 90,
    occurrences: 10,
    last_occurrence: '2026-07-01',
    next_expected: '2026-07-10',
    times_missed: 0,
    is_active: true,
    is_confirmed: false,
    pattern_kind: 'commitment',
    ...overrides,
  }
}

describe('getDailyDays', () => {
  it('returns every day of the month', () => {
    expect(getDailyDays(DAYS_IN_JULY)).toHaveLength(DAYS_IN_JULY)
    expect(getDailyDays(DAYS_IN_JULY)[0]).toBe(1)
    expect(getDailyDays(DAYS_IN_JULY).at(-1)).toBe(DAYS_IN_JULY)
  })
})

describe('getBillDaysForMonth -- daily', () => {
  it('expands a daily bill to all 31 days of a 31-day month, not 1', () => {
    const days = getBillDaysForMonth(bill({ frequency: 'daily' }), NON_LEAP_YEAR, JULY)
    expect(days).toHaveLength(DAYS_IN_JULY)
    expect(days).toEqual(Array.from({ length: DAYS_IN_JULY }, (_, i) => i + 1))
  })

  it('respects a short month and a leap February', () => {
    expect(getBillDaysForMonth(bill({ frequency: 'daily' }), NON_LEAP_YEAR, FEBRUARY)).toHaveLength(
      DAYS_IN_FEBRUARY,
    )
    expect(getBillDaysForMonth(bill({ frequency: 'daily' }), LEAP_YEAR, FEBRUARY)).toHaveLength(
      DAYS_IN_LEAP_FEBRUARY,
    )
  })

  it('does not need expected_day or next_expected to expand', () => {
    const days = getBillDaysForMonth(
      bill({ frequency: 'daily', expected_day: null, next_expected: null }),
      NON_LEAP_YEAR,
      JULY,
    )
    expect(days).toHaveLength(DAYS_IN_JULY)
  })

  it('accepts the API casing without the call site lowercasing', () => {
    expect(getBillDaysForMonth(bill({ frequency: 'DAILY' }), NON_LEAP_YEAR, JULY)).toHaveLength(
      DAYS_IN_JULY,
    )
  })
})

describe('getBillDaysForMonth -- other cadences', () => {
  it('places a monthly bill once, clamped into short months', () => {
    expect(getBillDaysForMonth(bill({ expected_day: 31 }), NON_LEAP_YEAR, FEBRUARY)).toEqual([
      DAYS_IN_FEBRUARY,
    ])
  })

  it('places a bimonthly bill every other month, not every month', () => {
    const tx = bill({ frequency: 'bimonthly', next_expected: '2026-01-10' })
    expect(getBillDaysForMonth(tx, NON_LEAP_YEAR, JANUARY)).toEqual([EXPECTED_DAY])
    expect(getBillDaysForMonth(tx, NON_LEAP_YEAR, FEBRUARY)).toEqual([])
    expect(getBillDaysForMonth(tx, NON_LEAP_YEAR, MARCH)).toEqual([EXPECTED_DAY])
  })

  it('places a semiannual bill twice a year, not every month', () => {
    const tx = bill({ frequency: 'semiannual', next_expected: '2026-01-10' })
    const hits = Array.from({ length: 12 }, (_, month) =>
      getBillDaysForMonth(tx, NON_LEAP_YEAR, month),
    ).filter((days) => days.length > 0)
    expect(hits).toHaveLength(2)
  })

  it('places a quarterly bill four times a year', () => {
    const tx = bill({ frequency: 'quarterly', next_expected: '2026-01-10' })
    const hits = Array.from({ length: 12 }, (_, month) =>
      getBillDaysForMonth(tx, NON_LEAP_YEAR, month),
    ).filter((days) => days.length > 0)
    expect(hits).toHaveLength(4)
  })

  it('places a yearly bill in its own month only', () => {
    const tx = bill({ frequency: 'yearly', next_expected: '2026-01-10' })
    expect(getBillDaysForMonth(tx, NON_LEAP_YEAR, JANUARY)).toEqual([EXPECTED_DAY])
    expect(getBillDaysForMonth(tx, NON_LEAP_YEAR, JULY)).toEqual([])
  })

  it('spreads a weekly bill across the month', () => {
    const days = getBillDaysForMonth(
      bill({ frequency: 'weekly', next_expected: '2026-07-06' }),
      NON_LEAP_YEAR,
      JULY,
    )
    expect(days.length).toBeGreaterThanOrEqual(4)
    expect(days.length).toBeLessThanOrEqual(5)
  })

  it('falls back to expected_day for an unrecognized frequency', () => {
    expect(getBillDaysForMonth(bill({ frequency: 'hourly' }), NON_LEAP_YEAR, JULY)).toEqual([
      EXPECTED_DAY,
    ])
  })
})

describe('buildBillMap with a daily bill', () => {
  it('places one entry per day and keys them uniquely', () => {
    const map = buildBillMap([bill({ frequency: 'daily' })], NON_LEAP_YEAR, JULY)
    expect(map.size).toBe(DAYS_IN_JULY)
    const keys = [...map.values()].flat().map((b) => b.key)
    expect(new Set(keys).size).toBe(DAYS_IN_JULY)
  })

  it('is bounded by the days in the viewed month, never a year of entries', () => {
    // buildBillMap is called for ONE month at a time by useBillCalendar, so a
    // daily bill costs at most ~31 rendered dots, not 365.
    const map = buildBillMap([bill({ frequency: 'daily' })], NON_LEAP_YEAR, JULY)
    expect(map.size).toBeLessThanOrEqual(getDaysInMonth(NON_LEAP_YEAR, JULY))
  })

  it('sums a daily bill across the whole month', () => {
    const map = buildBillMap([bill({ frequency: 'daily' })], NON_LEAP_YEAR, JULY)
    const total = [...map.values()].flat().reduce((sum, b) => sum + b.amount, 0)
    expect(total).toBe(PER_OCCURRENCE * DAYS_IN_JULY)
    expect(total).not.toBe(PER_OCCURRENCE)
  })
})
