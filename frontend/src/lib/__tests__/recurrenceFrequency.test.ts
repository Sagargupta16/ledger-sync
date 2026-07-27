import { describe, expect, it } from 'vitest'

import {
  DAYS_PER_YEAR,
  normalizeFrequency,
  periodsPerYear,
  RECURRENCE_FREQUENCIES,
  recurrenceCadence,
  toMonthlyAmount,
  type RecurrenceFrequency,
} from '@/lib/recurrenceFrequency'

/**
 * The bug class these guard: a `daily` recurrence costed as MONTHLY.
 *
 * Three separate per-page frequency tables each omitted `daily` and fell through
 * to a `12` default, so a daily charge was annualized at 12x instead of 365x --
 * roughly 30x too cheap. These cases pin the arithmetic, the casing contract,
 * and the completeness of the table against the backend's own enum.
 */

/** The eight values `RecurrenceFrequency` in `backend/.../db/_models/enums.py` can hold. */
const BACKEND_FREQUENCIES = [
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'bimonthly',
  'quarterly',
  'semiannual',
  'yearly',
] as const

/** A round per-occurrence amount so every expected product is exact. */
const DAILY_CHARGE = 50
const MONTHS_PER_YEAR = 12

describe('normalizeFrequency', () => {
  it('resolves every backend frequency in the backend casing', () => {
    for (const freq of BACKEND_FREQUENCIES) {
      expect(normalizeFrequency(freq)).toBe(freq)
    }
  })

  it('normalizes casing centrally so no call site has to', () => {
    expect(normalizeFrequency('DAILY')).toBe('daily')
    expect(normalizeFrequency('Daily')).toBe('daily')
    expect(normalizeFrequency('  MoNtHlY  ')).toBe('monthly')
    expect(normalizeFrequency('SEMIANNUAL')).toBe('semiannual')
  })

  it('resolves the legacy aliases the per-page tables accepted', () => {
    expect(normalizeFrequency('fortnightly')).toBe('biweekly')
    expect(normalizeFrequency('annually')).toBe('yearly')
  })

  it('returns null for absent or unknown input instead of a silent default', () => {
    expect(normalizeFrequency(null)).toBeNull()
    expect(normalizeFrequency(undefined)).toBeNull()
    expect(normalizeFrequency('')).toBeNull()
    expect(normalizeFrequency('hourly')).toBeNull()
  })
})

describe('periodsPerYear', () => {
  it('counts a daily recurrence as 365 occurrences, not 12', () => {
    expect(periodsPerYear('daily')).toBe(DAYS_PER_YEAR)
    expect(periodsPerYear('daily')).toBe(365)
    expect(periodsPerYear('daily')).not.toBe(MONTHS_PER_YEAR)
  })

  it('keeps the other bands at their established counts', () => {
    expect(periodsPerYear('weekly')).toBe(52)
    expect(periodsPerYear('biweekly')).toBe(26)
    expect(periodsPerYear('monthly')).toBe(12)
    expect(periodsPerYear('bimonthly')).toBe(6)
    expect(periodsPerYear('quarterly')).toBe(4)
    expect(periodsPerYear('semiannual')).toBe(2)
    expect(periodsPerYear('yearly')).toBe(1)
  })

  it('gives every backend frequency a distinct, positive, finite count', () => {
    const counts = BACKEND_FREQUENCIES.map((freq) => periodsPerYear(freq))
    for (const count of counts) {
      expect(count).toBeGreaterThan(0)
      expect(Number.isFinite(count)).toBe(true)
    }
    // A collision means two cadences cost the same, which is the defect shape:
    // `daily` used to collide with `monthly` at 12.
    expect(new Set(counts).size).toBe(BACKEND_FREQUENCIES.length)
  })

  it('exposes exactly the backend frequency set -- no drops, no extras', () => {
    expect([...RECURRENCE_FREQUENCIES].sort()).toEqual([...BACKEND_FREQUENCIES].sort())
  })
})

describe('toMonthlyAmount', () => {
  it('annualizes a per-day charge over 365 days, not 12 months', () => {
    // 50/day = 18,250/year = ~1,520.83/month. The defect reported 50/month.
    const annual = toMonthlyAmount(DAILY_CHARGE, 'daily') * MONTHS_PER_YEAR
    expect(annual).toBe(DAILY_CHARGE * DAYS_PER_YEAR)
    expect(annual).toBe(18_250)
    expect(annual).not.toBe(DAILY_CHARGE * MONTHS_PER_YEAR)
  })

  it('is casing-insensitive on the money path too', () => {
    expect(toMonthlyAmount(DAILY_CHARGE, 'DAILY')).toBe(toMonthlyAmount(DAILY_CHARGE, 'daily'))
  })

  it('passes a monthly charge through unchanged', () => {
    expect(toMonthlyAmount(DAILY_CHARGE, 'monthly')).toBe(DAILY_CHARGE)
  })

  it('treats a stored negative amount as a cost of the same size', () => {
    expect(toMonthlyAmount(-DAILY_CHARGE, 'daily')).toBe(toMonthlyAmount(DAILY_CHARGE, 'daily'))
  })

  it('falls back to monthly for unknown input rather than throwing', () => {
    expect(toMonthlyAmount(DAILY_CHARGE, null)).toBe(DAILY_CHARGE)
    expect(toMonthlyAmount(DAILY_CHARGE, 'hourly')).toBe(DAILY_CHARGE)
  })
})

describe('recurrenceCadence', () => {
  it('gives a daily bill a one-day stride', () => {
    expect(recurrenceCadence('daily')).toEqual({ unit: 'day', stride: 1 })
  })

  it('covers every backend frequency with a positive stride', () => {
    for (const freq of BACKEND_FREQUENCIES) {
      const cadence = recurrenceCadence(freq)
      expect(cadence, `no cadence for "${freq}"`).not.toBeNull()
      expect(cadence?.stride).toBeGreaterThan(0)
    }
  })

  it('returns null for unknown input', () => {
    expect(recurrenceCadence('hourly')).toBeNull()
    expect(recurrenceCadence(null)).toBeNull()
  })

  it('agrees with periodsPerYear on how often each cadence lands', () => {
    for (const freq of BACKEND_FREQUENCIES) {
      const cadence = recurrenceCadence(freq)
      if (!cadence) throw new Error(`no cadence for "${freq}"`)
      const perYear =
        cadence.unit === 'day'
          ? DAYS_PER_YEAR / cadence.stride
          : MONTHS_PER_YEAR / cadence.stride
      // Day strides do not divide 365 evenly (52.14 weeks), so compare loosely;
      // the point is that the two tables cannot disagree by a whole period.
      expect(Math.abs(perYear - periodsPerYear(freq))).toBeLessThan(1)
    }
  })
})

describe('frequency table completeness', () => {
  it('has no frequency that silently degrades to the monthly default', () => {
    // Every declared frequency must RESOLVE. A value that normalizes to null is
    // one that `periodsPerYear` would quietly cost at 12 -- the original bug.
    const unresolved = RECURRENCE_FREQUENCIES.filter(
      (freq: RecurrenceFrequency) => normalizeFrequency(freq) === null,
    )
    expect(unresolved).toEqual([])
  })
})
