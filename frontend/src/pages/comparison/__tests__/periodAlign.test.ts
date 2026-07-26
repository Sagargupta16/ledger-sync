import { describe, expect, it } from 'vitest'

import { alignToElapsed } from '../periodAlign'

/**
 * Comparing a running period against a finished one is a calendar artifact, not
 * a behavioural signal: on 2026-07-26 the ledger held 13,511 of income against a
 * typical 225,000, so an un-aligned July-vs-June card claimed income had fallen
 * 94%. These pin the truncation for every span length the page offers.
 */
describe('alignToElapsed', () => {
  const TODAY = '2026-07-26'

  it('truncates both months to the elapsed day count', () => {
    const result = alignToElapsed(
      { start: '2026-06-01', end: '2026-06-30' },
      { start: '2026-07-01', end: '2026-07-31' },
      TODAY,
    )
    expect(result.b).toEqual({ start: '2026-07-01', end: TODAY })
    expect(result.a).toEqual({ start: '2026-06-01', end: '2026-06-26' })
    expect(result.partial).toEqual({ daysElapsed: 26, daysTotal: 31 })
  })

  it('leaves two finished periods untouched', () => {
    const a = { start: '2025-01-01', end: '2025-12-31' }
    const b = { start: '2026-01-01', end: '2026-06-30' }
    const result = alignToElapsed(a, b, TODAY)
    expect(result.a).toBe(a)
    expect(result.b).toBe(b)
    expect(result.partial).toBeNull()
  })

  it('leaves a period that has not started untouched', () => {
    const a = { start: '2026-01-01', end: '2026-12-31' }
    const b = { start: '2027-01-01', end: '2027-12-31' }
    expect(alignToElapsed(a, b, TODAY).partial).toBeNull()
  })

  it('aligns a year-to-date span against the prior full year', () => {
    const result = alignToElapsed(
      { start: '2025-01-01', end: '2025-12-31' },
      { start: '2026-01-01', end: '2026-12-31' },
      TODAY,
    )
    // 2026 is not a leap year, so 1 Jan to 26 Jul is 207 days.
    expect(result.partial).toEqual({ daysElapsed: 207, daysTotal: 365 })
    expect(result.a).toEqual({ start: '2025-01-01', end: '2025-07-26' })
  })

  it('aligns a fiscal-year-to-date span against the prior FY', () => {
    const result = alignToElapsed(
      { start: '2025-04-01', end: '2026-03-31' },
      { start: '2026-04-01', end: '2027-03-31' },
      TODAY,
    )
    expect(result.partial).toEqual({ daysElapsed: 117, daysTotal: 365 })
    expect(result.a).toEqual({ start: '2025-04-01', end: '2025-07-26' })
  })

  it('clamps the aligned end when period A is shorter than the elapsed window', () => {
    // A ran only 10 days; it must not be stretched to day 26 of a month it never had.
    const result = alignToElapsed(
      { start: '2026-06-01', end: '2026-06-10' },
      { start: '2026-07-01', end: '2026-07-31' },
      TODAY,
    )
    expect(result.a.end).toBe('2026-06-10')
  })

  it('rolls the aligned end into the next month when the window crosses it', () => {
    const result = alignToElapsed(
      { start: '2026-02-01', end: '2027-01-31' },
      { start: '2026-07-01', end: '2027-06-30' },
      TODAY,
    )
    expect(result.a.end).toBe('2026-02-26')
  })

  it('treats the final day of a period as complete', () => {
    const result = alignToElapsed(
      { start: '2026-06-01', end: '2026-06-30' },
      { start: '2026-07-01', end: '2026-07-26' },
      TODAY,
    )
    expect(result.partial).toBeNull()
  })
})
