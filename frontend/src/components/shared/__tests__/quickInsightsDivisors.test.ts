import { describe, expect, it } from 'vitest'

import {
  computeDaysInRange,
  computeMonthsInRange,
  medianSpendingDay,
  resolveSpanRange,
} from '../quickInsightsData'

/**
 * Two defects these lock, both measured on the real 8,181-row ledger.
 *
 * 1. Inclusive endpoints. The backend filters `date >= start AND date <= end`,
 *    so `total_spending` includes both endpoints and the divisor must too.
 *    Differencing the dates alone dropped a day: June 2026 divided 108,508.01 by
 *    29 and published 3,741.66/day for a 30-day month (true 3,616.93, +3.45%),
 *    while the subtitle said "spread over 29 days".
 *
 * 2. Coverage. `daily-summaries` caps server-side and truncates the OLDEST days,
 *    so a window starting before the first row received is only partly covered.
 *    With the default 1,500-row page over 1,519 stored days, yearly-2019 read a
 *    typical day of 53.00 against a true 81.50 (-35.0%).
 */

describe('computeDaysInRange', () => {
  it('counts both endpoints for a 30-day month', () => {
    // The June 2026 case: 29 here published 3,741.66/day instead of 3,616.93.
    expect(computeDaysInRange({ start_date: '2026-06-01', end_date: '2026-06-30' }, [])).toBe(30)
  })

  it('counts both endpoints for a short month and a 31-day month', () => {
    expect(computeDaysInRange({ start_date: '2026-02-01', end_date: '2026-02-28' }, [])).toBe(28)
    expect(computeDaysInRange({ start_date: '2026-05-01', end_date: '2026-05-31' }, [])).toBe(31)
  })

  it('counts 365 days for a calendar year and a fiscal year', () => {
    expect(computeDaysInRange({ start_date: '2025-01-01', end_date: '2025-12-31' }, [])).toBe(365)
    expect(computeDaysInRange({ start_date: '2025-04-01', end_date: '2026-03-31' }, [])).toBe(365)
  })

  it('spans the real ledger window as 2769 days, not 2768', () => {
    expect(computeDaysInRange({ start_date: '2019-01-01', end_date: '2026-07-31' }, [])).toBe(2769)
  })

  it('returns 1 for a single-day window instead of a zero divisor', () => {
    expect(computeDaysInRange({ start_date: '2026-06-15', end_date: '2026-06-15' }, [])).toBe(1)
  })

  it('falls back to the transaction span, also inclusive', () => {
    const txs = [
      { date: '2026-06-01', amount: 10, type: 'Expense' },
      { date: '2026-06-30', amount: 20, type: 'Expense' },
    ]
    expect(computeDaysInRange({}, txs)).toBe(30)
  })

  it('keeps the 30-day default when there is no range and no rows', () => {
    expect(computeDaysInRange({}, [])).toBe(30)
  })
})

/**
 * The month divisor counts each partial month as the fraction of ITS OWN month
 * inside the window, so a complete month is exactly 1 whatever its length.
 *
 * This replaced `Math.max(days / 30.44, 1)`, which was wrong in both directions
 * (both measured on the real ledger on 2026-07-27):
 *   - the `, 1)` floor billed July's 27 elapsed days as a whole month and
 *     published a burn rate of 107,651.65 where those days pace 123,600.04;
 *   - the 30.44-day average month mis-sized every COMPLETE month of another
 *     length -- a 30-day June read 0.9855 months (110,099.46 against a real
 *     108,508.01), a 28-day February 0.9199 (106,483.19 against 97,947.74).
 */
describe('computeMonthsInRange', () => {
  it('reads a complete month as exactly 1, whatever its length', () => {
    // Was 0.9855 for June and 0.9199 for February under days/30.44.
    expect(computeMonthsInRange({ start_date: '2026-06-01', end_date: '2026-06-30' }, [])).toBe(1)
    expect(computeMonthsInRange({ start_date: '2026-02-01', end_date: '2026-02-28' }, [])).toBe(1)
    expect(computeMonthsInRange({ start_date: '2026-05-01', end_date: '2026-05-31' }, [])).toBe(1)
  })

  it('reads a calendar year and a fiscal year as exactly 12 months', () => {
    // days/30.44 gave 11.9908 -- a year that is not a year.
    expect(computeMonthsInRange({ start_date: '2025-01-01', end_date: '2025-12-31' }, [])).toBe(12)
    expect(computeMonthsInRange({ start_date: '2025-04-01', end_date: '2026-03-31' }, [])).toBe(12)
  })

  it('bills an in-progress month as its own elapsed fraction, not a whole one', () => {
    // July observed on the 27th: 27/31. The old floor called this 1.0 and
    // understated the burn rate by 12.9%, worst on the 1st of the month.
    expect(computeMonthsInRange({ start_date: '2026-07-01', end_date: '2026-07-27' }, [])).toBeCloseTo(
      27 / 31,
      10,
    )
  })

  it('sums each month against its own length across a boundary', () => {
    // June complete (1) plus 15 of July's 31 days -- not 45/30.44 = 1.4783.
    expect(computeMonthsInRange({ start_date: '2026-06-01', end_date: '2026-07-15' }, [])).toBeCloseTo(
      1 + 15 / 31,
      10,
    )
  })

  it('keeps a same-day window positive so the burn rate cannot divide by zero', () => {
    const oneDay = computeMonthsInRange({ start_date: '2026-06-15', end_date: '2026-06-15' }, [])
    expect(oneDay).toBeCloseTo(1 / 30, 10)
    expect(oneDay).toBeGreaterThan(0)
  })

  it('spans the real ledger window as exactly 91 months', () => {
    // 2019-01-01..2026-07-31 is 91 whole calendar months; days/30.44 said 90.9658.
    expect(computeMonthsInRange({ start_date: '2019-01-01', end_date: '2026-07-31' }, [])).toBe(91)
  })
})

/**
 * The all-time span the mean-rate divisors run on has to end at today.
 *
 * `max_date` comes off the rows uncapped. All-time is the shipped default view
 * and `getAnalyticsDateRange` returns `{null, null}` for it, so
 * `capEndDateAtToday` never runs and the fallback span was whatever the furthest
 * future-dated row said. Measured on the real ledger on 2026-07-27: a single
 * income row dated 2026-07-31 stretched the span to 2,769 days against the 2,765
 * elapsed, diluting Average Daily Spending 1,444.76 -> 1,442.67 and Monthly Burn
 * Rate 43,960.70 -> 43,898.37 on 3,994,751.41 of spend.
 */
describe('resolveSpanRange', () => {
  const TODAY = '2026-07-27'
  const LEDGER = { min_date: '2019-01-01', max_date: '2026-07-31' }
  const TOTAL_SPENDING = 3994751.41

  it('caps the data span at today instead of trusting the furthest row', () => {
    expect(resolveSpanRange({}, LEDGER, TODAY)).toEqual({
      start_date: '2019-01-01',
      end_date: TODAY,
    })
  })

  it('restores the real elapsed divisors on the all-time view', () => {
    const span = resolveSpanRange({}, LEDGER, TODAY)
    const days = computeDaysInRange(span, [])
    expect(days).toBe(2765)
    expect(TOTAL_SPENDING / days).toBeCloseTo(1444.76, 2)
    // What the uncapped span published.
    expect(computeDaysInRange({ start_date: '2019-01-01', end_date: '2026-07-31' }, [])).toBe(2769)
    expect(TOTAL_SPENDING / 2769).toBeCloseTo(1442.67, 2)

    const months = computeMonthsInRange(span, [])
    expect(months).toBeCloseTo(90.870968, 6)
    expect(TOTAL_SPENDING / months).toBeCloseTo(43960.7, 2)
    expect(TOTAL_SPENDING / 91).toBeCloseTo(43898.37, 2)
  })

  it('leaves a span that already ends in the past untouched', () => {
    expect(resolveSpanRange({}, { min_date: '2019-01-01', max_date: '2026-06-30' }, TODAY)).toEqual({
      start_date: '2019-01-01',
      end_date: '2026-06-30',
    })
  })

  it('caps a hand-picked custom range too, for the same reason', () => {
    // The presets cap themselves; a future end can only arrive from a custom one.
    expect(
      resolveSpanRange({ start_date: '2026-07-01', end_date: '2026-12-31' }, LEDGER, TODAY),
    ).toEqual({ start_date: '2026-07-01', end_date: TODAY })
  })

  it('prefers the explicit filter over the data span', () => {
    expect(
      resolveSpanRange({ start_date: '2026-06-01', end_date: '2026-06-30' }, LEDGER, TODAY),
    ).toEqual({ start_date: '2026-06-01', end_date: '2026-06-30' })
  })

  it('leaves both ends undefined when there is no filter and no data', () => {
    expect(resolveSpanRange({}, undefined, TODAY)).toEqual({
      start_date: undefined,
      end_date: undefined,
    })
  })
})

describe('medianSpendingDay coverage guard', () => {
  // Mirrors the real truncation: rows begin 2019-06-09 because the capped page
  // dropped 2019-01-01..2019-06-08.
  const served = [
    { date: '2019-06-09', expense: 53 },
    { date: '2019-07-01', expense: 53 },
    { date: '2019-08-01', expense: 200 },
    { date: '2020-01-01', expense: 175 },
  ]

  it('refuses a typical day when the window starts before the first row received', () => {
    // yearly-2019 would otherwise report 53.00 against a true 81.50.
    expect(medianSpendingDay(served, { start_date: '2019-01-01', end_date: '2019-12-31' })).toBeNull()
  })

  it('refuses for a fiscal year that reaches behind the covered span', () => {
    expect(medianSpendingDay(served, { start_date: '2019-04-01', end_date: '2020-03-31' })).toBeNull()
  })

  it('answers for a window fully inside the covered span', () => {
    expect(medianSpendingDay(served, { start_date: '2019-07-01', end_date: '2019-08-01' })).toBe(126.5)
  })

  it('answers when the window starts exactly on the first covered day', () => {
    expect(medianSpendingDay(served, { start_date: '2019-06-09', end_date: '2019-08-01' })).toBe(53)
  })

  it('still answers for an open-ended (all-time) window, which requests no start', () => {
    expect(medianSpendingDay(served, {})).toBe(114)
    expect(medianSpendingDay(served, { end_date: '2019-12-31' })).toBe(53)
  })

  it('does not depend on the rows arriving sorted', () => {
    const shuffled = [served[2], served[0], served[3], served[1]]
    expect(medianSpendingDay(shuffled, { start_date: '2019-01-01', end_date: '2019-12-31' })).toBeNull()
  })
})
