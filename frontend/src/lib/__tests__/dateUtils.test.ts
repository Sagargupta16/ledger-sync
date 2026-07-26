import { describe, it, expect } from 'vitest'

import {
  addDaysToKey,
  capEndDateAtToday,
  capSeriesToToday,
  daysInMonth,
  dropPartialMonth,
  formatMonthKey,
  getMonthProgress,
  inclusiveDaySpan,
  isPartialMonth,
  projectPartialMonth,
  toLocalDateKey,
} from '../dateUtils'

/**
 * These guard the timezone-stable date helpers. The bug class they replace:
 * `new Date('2024-01-01')` parses as UTC midnight, so local getters / local
 * formatting shift the calendar day (and month) for negative-offset users.
 * The helpers build Dates from explicit local components instead.
 */
describe('toLocalDateKey', () => {
  it('formats a local-midnight date as its own calendar day', () => {
    // Built from local components -> key must echo those components exactly.
    expect(toLocalDateKey(new Date(2026, 0, 1))).toBe('2026-01-01')
    expect(toLocalDateKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('zero-pads month and day', () => {
    expect(toLocalDateKey(new Date(2026, 2, 5))).toBe('2026-03-05')
  })

  it('round-trips the same calendar day it was constructed from', () => {
    const d = new Date(2026, 5, 6) // 6 Jun 2026, local midnight
    const key = toLocalDateKey(d)
    const [y, m, day] = key.split('-').map(Number)
    expect(y).toBe(d.getFullYear())
    expect(m).toBe(d.getMonth() + 1)
    expect(day).toBe(d.getDate())
  })
})

describe('formatMonthKey', () => {
  it('formats a YYYY-MM key without a UTC round-trip shift', () => {
    // January must read as January (not December of the prior year, which is
    // what new Date('2026-01-01').toLocaleDateString gives in US zones).
    expect(formatMonthKey('2026-01')).toBe('Jan 2026')
    expect(formatMonthKey('2026-12')).toBe('Dec 2026')
  })

  it('accepts a full YYYY-MM-DD and uses only the month', () => {
    expect(formatMonthKey('2026-07-15')).toBe('Jul 2026')
  })

  it('honors custom Intl options', () => {
    expect(formatMonthKey('2026-03', { month: 'short', year: '2-digit' })).toBe("Mar 26")
  })

  it('returns the input unchanged for an unparseable key', () => {
    expect(formatMonthKey('not-a-date')).toBe('not-a-date')
  })
})

describe('capEndDateAtToday', () => {
  const today = toLocalDateKey(new Date())
  const yesterday = toLocalDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000))
  const tomorrow = toLocalDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000))

  it('caps a future end_date at today', () => {
    const result = capEndDateAtToday({ start_date: '2026-01-01', end_date: tomorrow })
    expect(result.end_date).toBe(today)
    expect(result.start_date).toBe('2026-01-01')
  })

  it('leaves past end_date untouched', () => {
    const range = { start_date: '2020-01-01', end_date: yesterday }
    expect(capEndDateAtToday(range)).toBe(range)
  })

  it('preserves null end_date (all_time)', () => {
    const range = { start_date: null, end_date: null }
    expect(capEndDateAtToday(range)).toBe(range)
  })

  it('does not mutate the input when capping', () => {
    const range = { start_date: '2026-01-01', end_date: '2999-12-31' }
    capEndDateAtToday(range)
    expect(range.end_date).toBe('2999-12-31')
  })
})

describe('capSeriesToToday', () => {
  const today = toLocalDateKey(new Date())
  const currentMonth = today.slice(0, 7)

  it('drops future day-keyed rows and keeps today', () => {
    const rows = [
      { date: '2020-01-01', v: 1 },
      { date: today, v: 2 },
      { date: '2999-12-31', v: 3 }
    ]
    expect(capSeriesToToday(rows, 'date')).toEqual([
      { date: '2020-01-01', v: 1 },
      { date: today, v: 2 }
    ])
  })

  it('drops future month-keyed rows and keeps current month', () => {
    const rows = [
      { month: '2020-06', v: 1 },
      { month: currentMonth, v: 2 },
      { month: '2999-12', v: 3 }
    ]
    expect(capSeriesToToday(rows, 'month')).toEqual([
      { month: '2020-06', v: 1 },
      { month: currentMonth, v: 2 }
    ])
  })

  it('handles Date-valued keys', () => {
    const rows = [
      { d: new Date(2020, 0, 1), v: 1 },
      { d: new Date(2999, 11, 31), v: 2 }
    ]
    expect(capSeriesToToday(rows, 'd')).toEqual([rows[0]])
  })

  it('returns empty array unchanged', () => {
    expect(capSeriesToToday([] as Array<{ date: string }>, 'date')).toEqual([])
  })

  it('preserves original order (does not sort)', () => {
    const rows = [
      { date: '2022-05-01', v: 1 },
      { date: '2020-01-01', v: 2 },
      { date: today, v: 3 }
    ]
    expect(capSeriesToToday(rows, 'date').map((r) => r.v)).toEqual([1, 2, 3])
  })
})

/**
 * Partial-period helpers. The bug class they replace: a month still in
 * progress is charted and compared as if it were complete. On a real ledger
 * where salary lands near month-end, the 26th of the month showed income of
 * 13,511 against a typical 225,000, so the naive savings rate read -696.8%.
 */
describe('addDaysToKey', () => {
  it('shifts within a month', () => {
    expect(addDaysToKey('2026-07-01', 25)).toBe('2026-07-26')
  })

  it('rolls over month and year boundaries', () => {
    expect(addDaysToKey('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('handles leap February', () => {
    expect(addDaysToKey('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDaysToKey('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('shifts backwards for a negative offset', () => {
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('accepts a longer ISO string and returns a date key', () => {
    expect(addDaysToKey('2026-07-26T10:30:00', 0)).toBe('2026-07-26')
  })
})

describe('inclusiveDaySpan', () => {
  it('counts a single day as 1', () => {
    expect(inclusiveDaySpan('2026-07-26', '2026-07-26')).toBe(1)
  })

  it('counts a full month inclusively', () => {
    expect(inclusiveDaySpan('2026-01-01', '2026-01-31')).toBe(31)
  })

  it('counts a non-leap year as 365 and a leap year as 366', () => {
    expect(inclusiveDaySpan('2026-01-01', '2026-12-31')).toBe(365)
    expect(inclusiveDaySpan('2024-01-01', '2024-12-31')).toBe(366)
  })

  it('counts a fiscal year across the year boundary', () => {
    expect(inclusiveDaySpan('2025-04-01', '2026-03-31')).toBe(365)
  })

  it('floors at 1 for an inverted range', () => {
    expect(inclusiveDaySpan('2026-07-26', '2026-07-01')).toBe(1)
  })
})

describe('daysInMonth', () => {
  it('returns calendar length for 31, 30, and 28 day months', () => {
    expect(daysInMonth('2026-01')).toBe(31)
    expect(daysInMonth('2026-04')).toBe(30)
    expect(daysInMonth('2026-02')).toBe(28)
  })

  it('handles leap February', () => {
    expect(daysInMonth('2024-02')).toBe(29)
  })

  it('accepts a full date key', () => {
    expect(daysInMonth('2026-07-26')).toBe(31)
  })
})

describe('getMonthProgress', () => {
  const now = new Date(2026, 6, 26) // 2026-07-26, 31-day month

  it('reports the current month as partial with elapsed days', () => {
    expect(getMonthProgress('2026-07', now)).toEqual({
      isPartial: true,
      daysElapsed: 26,
      daysTotal: 31,
      fraction: 26 / 31,
    })
  })

  it('reports a past month as complete', () => {
    expect(getMonthProgress('2026-06', now)).toEqual({
      isPartial: false,
      daysElapsed: 30,
      daysTotal: 30,
      fraction: 1,
    })
  })

  it('reports a future month as not partial with zero elapsed', () => {
    expect(getMonthProgress('2026-08', now)).toEqual({
      isPartial: false,
      daysElapsed: 0,
      daysTotal: 31,
      fraction: 0,
    })
  })

  it('treats the last day of the month as fully elapsed', () => {
    expect(getMonthProgress('2026-07', new Date(2026, 6, 31)).fraction).toBe(1)
  })
})

describe('isPartialMonth', () => {
  const now = new Date(2026, 6, 26)

  it('is true only for the current month', () => {
    expect(isPartialMonth('2026-07', now)).toBe(true)
    expect(isPartialMonth('2026-06', now)).toBe(false)
    expect(isPartialMonth('2026-08', now)).toBe(false)
  })
})

describe('dropPartialMonth', () => {
  const now = new Date(2026, 6, 26)

  it('drops the in-progress month from a month-keyed series', () => {
    const rows = [
      { month: '2026-05', savingsRate: 46 },
      { month: '2026-06', savingsRate: 52 },
      { month: '2026-07', savingsRate: -696.8 },
    ]
    expect(dropPartialMonth(rows, 'month', now)).toEqual(rows.slice(0, 2))
  })

  it('drops day-keyed rows that fall in the partial month', () => {
    const rows = [{ date: '2026-06-30', v: 1 }, { date: '2026-07-02', v: 2 }]
    expect(dropPartialMonth(rows, 'date', now)).toEqual([rows[0]])
  })

  it('keeps rows whose key is not a date', () => {
    const rows = [{ month: null as unknown as string, v: 1 }]
    expect(dropPartialMonth(rows, 'month', now)).toEqual(rows)
  })

  it('returns an empty series unchanged', () => {
    expect(dropPartialMonth([] as Array<{ month: string }>, 'month', now)).toEqual([])
  })
})

describe('projectPartialMonth', () => {
  const now = new Date(2026, 6, 26)

  it('extrapolates a partial total to a full-month estimate', () => {
    expect(projectPartialMonth(26000, '2026-07', now)).toBeCloseTo(31000, 6)
  })

  it('leaves a complete month untouched', () => {
    expect(projectPartialMonth(30000, '2026-06', now)).toBe(30000)
  })

  it('returns the input when no days have elapsed', () => {
    expect(projectPartialMonth(0, '2026-08', now)).toBe(0)
  })
})
