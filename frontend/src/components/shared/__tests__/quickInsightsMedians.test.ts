import { describe, expect, it } from 'vitest'

import { monthlySpendShape } from '@/pages/spending-analysis/spendingAnalysisUtils'

import { medianSpendingDay, medianSpendingMonth } from '../quickInsightsData'

/**
 * Real-ledger anchors (8,181 rows, soft-deleted excluded). `medianSpendingDay`
 * consumes the daily_summaries rollup, so its anchors come from that series, not
 * from re-aggregating raw transactions:
 *   spend per active day (rollup): n=1380, mean 2872.42, median 404.07
 *   spend per complete month:      n=89,   mean 43701.27, median 12599.49
 * The month in progress (2026-07) must not enter the monthly median, and
 * zero-spend days must not enter the daily one -- 1,389 of the 2,769 calendar
 * days in the span have no expense, so an every-calendar-day median reads 0.00.
 */

const day = (date: string, expense: number) => ({ date, expense })

describe('medianSpendingDay', () => {
  it('takes the median of days that actually had spending', () => {
    const rows = [day('2026-06-01', 100), day('2026-06-02', 400), day('2026-06-03', 9000)]
    expect(medianSpendingDay(rows, {})).toBe(400)
  })

  it('drops zero-spend days instead of letting them pull the median to 0', () => {
    const rows = [
      day('2026-06-01', 0),
      day('2026-06-02', 0),
      day('2026-06-03', 0),
      day('2026-06-04', 500),
      day('2026-06-05', 700),
    ]
    expect(medianSpendingDay(rows, {})).toBe(600)
  })

  it('honours the selected window', () => {
    const rows = [day('2026-05-31', 99_999), day('2026-06-01', 300), day('2026-06-02', 500)]
    expect(medianSpendingDay(rows, { start_date: '2026-06-01', end_date: '2026-06-30' })).toBe(400)
  })

  it('treats negative expense values as magnitudes', () => {
    expect(medianSpendingDay([day('2026-06-01', -250)], {})).toBe(250)
  })

  it('returns null when no row falls in the window', () => {
    const rows = [day('2026-01-01', 500)]
    expect(medianSpendingDay(rows, { start_date: '2026-06-01', end_date: '2026-06-30' })).toBeNull()
  })

  it('returns null for an empty or missing series', () => {
    expect(medianSpendingDay([], {})).toBeNull()
    expect(medianSpendingDay(undefined, {})).toBeNull()
  })

  it('returns null when every day in the window spent nothing', () => {
    expect(medianSpendingDay([day('2026-06-01', 0), day('2026-06-02', 0)], {})).toBeNull()
  })

  it('returns the single value when only one spending day exists', () => {
    expect(medianSpendingDay([day('2026-06-01', 0), day('2026-06-02', 407)], {})).toBe(407)
  })
})

describe('medianSpendingMonth', () => {
  const now = new Date(2026, 6, 27) // 2026-07-27, mid-month

  it('excludes the month in progress, which always reads low', () => {
    const monthly = {
      '2026-04': { expense: 77_700.92 },
      '2026-05': { expense: 83_632.81 },
      '2026-06': { expense: 108_508.01 },
      '2026-07': { expense: 107_651.65 },
    }
    // Median of the three complete months, not four.
    expect(medianSpendingMonth(monthly, now)).toBe(83_632.81)
  })

  it('averages the two middles across an even number of complete months', () => {
    const monthly = {
      '2026-03': { expense: 88_955.7 },
      '2026-04': { expense: 77_700.92 },
      '2026-05': { expense: 83_632.81 },
      '2026-06': { expense: 108_508.01 },
      '2026-07': { expense: 107_651.65 },
    }
    expect(medianSpendingMonth(monthly, now)).toBeCloseTo((83_632.81 + 88_955.7) / 2, 2)
  })

  it('treats negative monthly expense totals as magnitudes', () => {
    const monthly = { '2026-05': { expense: -100 }, '2026-06': { expense: -300 } }
    expect(medianSpendingMonth(monthly, now)).toBe(200)
  })

  it('returns null below two complete months, where a median means nothing', () => {
    expect(medianSpendingMonth({ '2026-06': { expense: 108_508.01 } }, now)).toBeNull()
    expect(medianSpendingMonth({ '2026-07': { expense: 107_651.65 } }, now)).toBeNull()
  })

  it('returns null for a missing or empty map', () => {
    expect(medianSpendingMonth(undefined, now)).toBeNull()
    expect(medianSpendingMonth({}, now)).toBeNull()
  })

  it('counts a month you spent nothing in, because it is still a month', () => {
    // This used to filter `v > 0` and answer 200 -- the median of the months in
    // which anything was spent, not of the months. The mean printed beside it
    // (Monthly Burn Rate, divisor `monthsCovered`) counts every calendar month,
    // and both halves render through one `meanRateSubtitle` phrase, so the
    // filtered version shipped two definitions of "typical month is X".
    const monthly = {
      '2026-03': { expense: 0 },
      '2026-04': { expense: 100 },
      '2026-05': { expense: 200 },
      '2026-06': { expense: 300 },
    }
    expect(medianSpendingMonth(monthly, now)).toBe(150)
  })

  it('treats a month the rollup omitted the same as an explicit zero', () => {
    // monthly_summaries only carries rows for months that have activity, so a
    // spend-free month arrives as a MISSING key rather than a 0. Reading
    // Object.keys alone would let sparsity shrink the divisor back to
    // months-with-spend through the back door.
    const gappy = { '2026-03': { expense: 100 }, '2026-06': { expense: 300 } }
    const explicit = {
      '2026-03': { expense: 100 },
      '2026-04': { expense: 0 },
      '2026-05': { expense: 0 },
      '2026-06': { expense: 300 },
    }
    expect(medianSpendingMonth(gappy, now)).toBe(50)
    expect(medianSpendingMonth(gappy, now)).toBe(medianSpendingMonth(explicit, now))
  })

  it('tolerates entries with no expense field', () => {
    const monthly = { '2026-04': {}, '2026-05': { expense: 200 }, '2026-06': { expense: 400 } }
    expect(medianSpendingMonth(monthly, now)).toBe(200)
  })

  it('pads a single-digit month so the string cutoff compares correctly', () => {
    // Cutoff must be "2026-03", not "2026-3": "2026-11" < "2026-3" is true as a
    // string, which would let a future month through.
    const monthly = {
      '2026-01': { expense: 100 },
      '2026-02': { expense: 200 },
      '2026-11': { expense: 9_999 },
    }
    expect(medianSpendingMonth(monthly, new Date(2026, 2, 15))).toBe(150)
  })
})

/**
 * One definition of "a typical month", across both pages that print the phrase.
 *
 * `medianSpendingMonth` feeds the Quick Insights "Monthly Burn Rate" subtitle and
 * `monthlySpendShape().median` feeds the Expense Analysis "Monthly Avg" subtitle,
 * and BOTH render through `meanRateSubtitle(..., { typicalNoun: 'month is' })` --
 * literally the same sentence. `medianSpendingMonth` filtered zero-spend months
 * out while the sibling kept them in, so the identical phrase disagreed:
 * reproduced this session over four calendar months with spend in two (10,000 /
 * 0 / 0 / 30,000), a 4-month divisor and a 10,000 mean gave a typical month of
 * 20,000 in Quick Insights against 5,000 on Expense Analysis, 4x apart.
 */
describe('typical month, one definition', () => {
  const now = new Date(2026, 6, 27)

  it('agrees with the Expense Analysis median on the reproduced divergence', () => {
    const monthly = {
      '2026-01': { expense: 10_000 },
      '2026-02': { expense: 0 },
      '2026-03': { expense: 0 },
      '2026-04': { expense: 30_000 },
    }
    const shape = monthlySpendShape(
      [
        { date: '2026-01-10', amount: 10_000 },
        { date: '2026-04-10', amount: 30_000 },
      ],
      { start_date: '2026-01-01', end_date: '2026-04-30' },
      now,
    )
    // Old value here: 20,000 (median of [10000, 30000]).
    expect(medianSpendingMonth(monthly, now)).toBe(5_000)
    expect(medianSpendingMonth(monthly, now)).toBe(shape?.median)
    // And both sit under the same mean, so the subtitle's two halves agree.
    expect(shape?.mean).toBe(10_000)
  })

  it('agrees on a dense window too, where the old filter was a no-op', () => {
    const monthly = {
      '2026-04': { expense: 77_700.92 },
      '2026-05': { expense: 83_632.81 },
      '2026-06': { expense: 108_508.01 },
    }
    const shape = monthlySpendShape(
      [
        { date: '2026-04-10', amount: 77_700.92 },
        { date: '2026-05-10', amount: 83_632.81 },
        { date: '2026-06-10', amount: 108_508.01 },
      ],
      { start_date: '2026-04-01', end_date: '2026-06-30' },
      now,
    )
    expect(medianSpendingMonth(monthly, now)).toBe(83_632.81)
    expect(medianSpendingMonth(monthly, now)).toBe(shape?.median)
  })
})
