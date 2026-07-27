import { afterEach, describe, expect, it, vi } from 'vitest'

import { toPeriodRange } from '../budgetUtils'
import type { PresetPeriod } from '../components/PeriodPicker'

/**
 * Every assertion here is written in LOCAL calendar terms and the clock is faked
 * with local components (`new Date(2026, 6, 27)` = 27 July 2026, 00:00 local),
 * which is the repo idiom. That combination is what pins the bug this file
 * exists for: `toPeriodRange` used to end each branch in `.toISOString()`, which
 * reprojects the local instant to UTC. Run from IST (UTC+5:30), local 1 August
 * serialises as `2025-07-31T18:30:00.000Z`, so the returned window silently
 * started a day early. Asserting the local key makes that shift a failure in any
 * positive-offset zone instead of a silent off-by-one.
 */
afterEach(() => {
  vi.useRealTimers()
})

/** 27 July 2026, local midnight. Mid-month on purpose so the month-end and
 *  month-start arithmetic are both exercised (a 1st-of-month "today" would let a
 *  wrong `end` still look right). */
const freezeAtJuly2026 = () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 6, 27))
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

describe('toPeriodRange preset windows', () => {
  it.each<[PresetPeriod, string, string]>([
    // Rolling windows are month-aligned: first day of the starting month through
    // the last day of the current month.
    ['last_3_months', '2026-05-01', '2026-07-31'],
    ['last_6_months', '2026-02-01', '2026-07-31'],
    ['last_12_months', '2025-08-01', '2026-07-31'],
    ['last_2_years', '2024-08-01', '2026-07-31'],
    ['last_5_years', '2021-08-01', '2026-07-31'],
    // Indian FY: April to March. July 2026 sits in FY 2026-27.
    ['this_fy', '2026-04-01', '2026-07-31'],
  ])('%s spans %s to %s', (period, start, end) => {
    freezeAtJuly2026()
    expect(toPeriodRange(period)).toEqual({ start, end })
  })

  it('returns bare YYYY-MM-DD keys, never full ISO instants', () => {
    freezeAtJuly2026()
    const periods: PresetPeriod[] = [
      'last_3_months',
      'last_6_months',
      'last_12_months',
      'last_2_years',
      'last_5_years',
      'this_fy',
      'all_time',
    ]
    for (const period of periods) {
      const { start, end } = toPeriodRange(period)
      expect(start, `${period} start`).toMatch(DATE_KEY)
      expect(end, `${period} end`).toMatch(DATE_KEY)
    }
  })

  it('ends the window on the real last day of a 30-day month', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 15)) // 15 April 2026
    expect(toPeriodRange('last_3_months')).toEqual({
      start: '2026-02-01',
      end: '2026-04-30',
    })
  })

  it('ends the window on 29 February in a leap year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 1, 10)) // 10 February 2024
    expect(toPeriodRange('last_3_months')).toEqual({
      start: '2023-12-01',
      end: '2024-02-29',
    })
  })

  it('rolls this_fy back a calendar year before April', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 20)) // 20 January 2026 -> FY 2025-26
    expect(toPeriodRange('this_fy')).toEqual({
      start: '2025-04-01',
      end: '2026-01-31',
    })
  })

  it('treats 1 April as the first day of the new FY', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 1))
    expect(toPeriodRange('this_fy')).toEqual({
      start: '2026-04-01',
      end: '2026-04-30',
    })
  })

  it('falls back to last 12 months for an unknown preset', () => {
    freezeAtJuly2026()
    // Router/localStorage can hand back a stale preset string; the default arm
    // must still produce a usable window rather than an invalid range.
    expect(toPeriodRange('nonsense' as PresetPeriod)).toEqual({
      start: '2025-08-01',
      end: '2026-07-31',
    })
  })
})

describe('toPeriodRange all_time', () => {
  it('uses the caller-supplied data bounds verbatim', () => {
    freezeAtJuly2026()
    expect(
      toPeriodRange('all_time', { minDate: '2012-07-01', maxDate: '2026-07-31' }),
    ).toEqual({ start: '2012-07-01', end: '2026-07-31' })
  })

  it('falls back to a wide floor and the current month end while bounds load', () => {
    freezeAtJuly2026()
    expect(toPeriodRange('all_time')).toEqual({
      start: '2000-01-01',
      end: '2026-07-31',
    })
  })

  it('fills only the missing bound', () => {
    freezeAtJuly2026()
    expect(toPeriodRange('all_time', { minDate: '2015-03-04' })).toEqual({
      start: '2015-03-04',
      end: '2026-07-31',
    })
    expect(toPeriodRange('all_time', { maxDate: '2026-06-30' })).toEqual({
      start: '2000-01-01',
      end: '2026-06-30',
    })
  })
})

describe('toPeriodRange custom', () => {
  it('passes the picker strings straight through without a Date round-trip', () => {
    freezeAtJuly2026()
    expect(
      toPeriodRange('custom', { customStart: '2025-01-15', customEnd: '2025-03-20' }),
    ).toEqual({ start: '2025-01-15', end: '2025-03-20' })
  })

  it('falls back to last 12 months when either custom bound is missing', () => {
    freezeAtJuly2026()
    const expected = { start: '2025-08-01', end: '2026-07-31' }
    expect(toPeriodRange('custom')).toEqual(expected)
    expect(toPeriodRange('custom', { customStart: '2025-01-15' })).toEqual(expected)
    expect(toPeriodRange('custom', { customEnd: '2025-03-20' })).toEqual(expected)
  })
})
