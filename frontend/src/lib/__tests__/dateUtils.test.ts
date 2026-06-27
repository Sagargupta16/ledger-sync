import { describe, it, expect } from 'vitest'

import { formatMonthKey, toLocalDateKey } from '../dateUtils'

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
