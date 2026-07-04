import { describe, it, expect } from 'vitest'

import { capEndDateAtToday, capSeriesToToday, formatMonthKey, toLocalDateKey } from '../dateUtils'

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
