import { afterEach, describe, expect, it, vi } from 'vitest'

import { getFYFromDate } from '@/lib/taxCalculator'

import { currentFYLabel, dateToFY, nextFY, parseBareStartYear } from '../fyHelpers'

describe('parseBareStartYear', () => {
  it('reads the start year off a bare label', () => {
    expect(parseBareStartYear('2026-27')).toBe(2026)
    expect(parseBareStartYear('2019-20')).toBe(2019)
  })

  it('returns 0 for an unparseable label instead of NaN', () => {
    expect(parseBareStartYear('')).toBe(0)
  })
})

describe('nextFY', () => {
  it('advances one fiscal year', () => {
    expect(nextFY('2026-27')).toBe('2027-28')
  })

  it('zero-pads the century rollover', () => {
    expect(nextFY('2098-99')).toBe('2099-00')
  })
})

describe('dateToFY', () => {
  it('files a date after the FY start month into that year', () => {
    expect(dateToFY('2026-07-26')).toBe('2026-27')
  })

  it('files a date before the FY start month into the previous year', () => {
    expect(dateToFY('2026-03-31')).toBe('2025-26')
  })

  it('puts the 1st of the FY start month in the NEW year, timezone-independently', () => {
    // `new Date('2026-04-01')` is UTC midnight but `getMonth()` is local, so
    // negative-offset users used to read this as March -> the previous FY.
    expect(dateToFY('2026-04-01')).toBe('2026-27')
  })

  it('honours a non-April fiscal year start', () => {
    // The defect: this hardcoded April, so a January-FY user saw RSU vestings
    // badged with a different FY than the tax engine computes for the same date.
    expect(dateToFY('2026-02-15', 1)).toBe('2026-27')
    expect(dateToFY('2026-02-15', 4)).toBe('2025-26')
    // A July-FY user: June is still the prior FY, July opens the new one.
    expect(dateToFY('2026-06-30', 7)).toBe('2025-26')
    expect(dateToFY('2026-07-01', 7)).toBe('2026-27')
  })

  it('agrees with the tax engine on the same date and start month', () => {
    // These two must never diverge -- the salary grid keys and the tax page's
    // FY selector are compared against each other.
    for (const month of [1, 4, 7, 10]) {
      for (const date of ['2026-01-01', '2026-04-01', '2026-07-26', '2026-12-31']) {
        expect(`FY ${dateToFY(date, month)}`).toBe(getFYFromDate(date, month))
      }
    }
  })

  it('returns empty string for an unparseable date', () => {
    expect(dateToFY('not-a-date')).toBe('')
    expect(dateToFY('')).toBe('')
  })
})

describe('currentFYLabel', () => {
  afterEach(() => {
    // `vi.stubEnv` rather than touching `process.env` directly: the app tsconfig
    // omits node types, and assigning `undefined` back would store the literal
    // string "undefined", which resolves to UTC and leaks into later tests.
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('reports the local FY, not the UTC one, at the April boundary', () => {
    vi.stubEnv('TZ', 'Asia/Kolkata')
    vi.useFakeTimers()
    // 01:30 IST on 1 April 2026 -- the UTC instant is still 31 March, i.e. the
    // PREVIOUS fiscal year. Deriving from `toISOString()` opened Settings on
    // the wrong FY's salary row for the first 5.5 hours of the new FY.
    vi.setSystemTime(new Date('2026-03-31T20:00:00.000Z'))

    expect(new Date().getMonth()).toBe(3) // April, locally
    expect(currentFYLabel()).toBe('2026-27')
  })

  it('honours a non-April fiscal year start', () => {
    vi.stubEnv('TZ', 'Asia/Kolkata')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-15T06:00:00.000Z'))

    expect(currentFYLabel(4)).toBe('2025-26')
    expect(currentFYLabel(1)).toBe('2026-27')
  })

  it('returns a bare label, not the tax engine display form', () => {
    // The grid uses these as `salary_structure` object keys, so a stray
    // "FY " prefix would silently create a duplicate FY row.
    expect(currentFYLabel()).not.toMatch(/^FY /)
    expect(currentFYLabel()).toMatch(/^\d{4}-\d{2}$/)
  })
})
