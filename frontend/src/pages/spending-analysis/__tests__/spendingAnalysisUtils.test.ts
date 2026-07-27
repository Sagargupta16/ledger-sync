/**
 * Locks the "Monthly Avg" divisor and the label that describes it.
 *
 * Both defects were measured on the real 8,181-row ledger on 2026-07-27, over its
 * complete months (2019-01..2026-06):
 *
 * 1. Divisor. The old code divided by `new Set(months carrying an expense).size`,
 *    so a month you spent nothing in vanished from a per-month average.
 *    3,887,099.76 across 89 months-with-expense = 43,675.28, where the 90 calendar
 *    months the window actually spans (2019-03 carries no expense row) give
 *    43,190.00. The gap scales with sparsity, and this page is category
 *    deep-linkable: `?category=Family` spans 87 months with rows in 48, so the
 *    card read 27,002.56 instead of 14,897.96 -- an 81.3% overstatement.
 *
 * 2. Label. The subtitle was the flat string "Average spending per month", which
 *    let a mean be read as a typical month. Monthly spend is heavily skewed here
 *    (mean 43,190.00 vs median month 12,101.31, 3.6x), so the mean stays the
 *    headline -- budget math needs the total spread over the period -- and the
 *    subtitle now names it a mean and quotes the typical month beside it.
 */

import { describe, expect, it } from 'vitest'

import {
  monthlyAvgLineLabelFor,
  monthlyAvgSubtitleFor,
  monthlySpendShape,
  spanMonthKeys,
} from '../spendingAnalysisUtils'

const NOW = new Date(2026, 6, 27)

/** Formatter stub: plain digits keep the assertions about copy, not locale. */
const money = (n: number) => n.toFixed(2)

function expense(date: string, amount: number) {
  return { date, amount }
}

describe('monthlySpendShape divisor', () => {
  it('counts a zero-spend month inside the window', () => {
    // Three calendar months, rows in two. Old divisor: 2 -> 15,000.
    const shape = monthlySpendShape(
      [expense('2026-01-10', 20000), expense('2026-03-10', 10000)],
      { start_date: '2026-01-01', end_date: '2026-03-31' },
      NOW,
    )
    expect(shape?.monthsCounted).toBe(3)
    expect(shape?.monthsWithSpend).toBe(2)
    expect(shape?.mean).toBe(10000)
  })

  it('reproduces the real ledger gap: 90 calendar months, not 89 with rows', () => {
    // One row per month across 2019-01..2026-06 except 2019-03, the month the
    // real ledger has no expense in. Totals scaled to the measured aggregate so
    // the two divisors reproduce the measured means.
    const rows: { date: string; amount: number }[] = []
    let year = 2019
    let month = 1
    while (`${year}-${String(month).padStart(2, '0')}` <= '2026-06') {
      const key = `${year}-${String(month).padStart(2, '0')}`
      if (key !== '2019-03') rows.push(expense(`${key}-10`, 3887099.76 / 89))
      month += 1
      if (month > 12) {
        month = 1
        year += 1
      }
    }
    const shape = monthlySpendShape(rows, { start_date: '2019-01-01', end_date: '2026-06-30' }, NOW)
    expect(shape?.monthsWithSpend).toBe(89)
    expect(shape?.monthsCounted).toBe(90)
    expect(shape?.mean).toBeCloseTo(43190.0, 2)
    // The number the old months-with-expense divisor published.
    expect(3887099.76 / 89).toBeCloseTo(43675.28, 2)
  })

  it('reproduces the sparse-category overstatement', () => {
    // The `?category=Family` shape: 87 months spanned, 48 carrying rows.
    const rows: { date: string; amount: number }[] = []
    let year = 2019
    let month = 4
    let placed = 0
    while (`${year}-${String(month).padStart(2, '0')}` <= '2026-06') {
      const key = `${year}-${String(month).padStart(2, '0')}`
      if (placed < 48) {
        rows.push(expense(`${key}-10`, 1296122.92 / 48))
        placed += 1
      }
      month += 1
      if (month > 12) {
        month = 1
        year += 1
      }
    }
    const shape = monthlySpendShape(rows, { start_date: '2019-04-01', end_date: '2026-06-30' }, NOW)
    expect(shape?.monthsCounted).toBe(87)
    expect(shape?.monthsWithSpend).toBe(48)
    expect(shape?.mean).toBeCloseTo(14897.96, 2)
    expect(1296122.92 / 48).toBeCloseTo(27002.56, 2)
  })

  it('uses the bounded range, so a chosen FY is 12 months either way', () => {
    const shape = monthlySpendShape(
      [expense('2025-04-10', 60000), expense('2025-05-10', 60000)],
      { start_date: '2025-04-01', end_date: '2026-03-31' },
      NOW,
    )
    expect(shape?.monthsCounted).toBe(12)
    expect(shape?.mean).toBe(10000)
  })

  it('caps the open-ended window at the current month so future rows add no empty months', () => {
    // All-time passes no end date. A row a year out would otherwise append 12
    // zero months to the divisor; the real ledger carries a 2026-07-31 row.
    const shape = monthlySpendShape(
      [expense('2026-06-10', 40000), expense('2027-06-10', 20000)],
      { start_date: null, end_date: null },
      NOW,
    )
    expect(shape?.monthsCounted).toBe(2)
    expect(shape?.mean).toBe(20000)
  })

  it('returns null with no expenses rather than a zero that looks measured', () => {
    expect(monthlySpendShape([], { start_date: '2026-01-01', end_date: '2026-03-31' }, NOW)).toBeNull()
  })

  it('falls back to the months with rows when the window spans none of them', () => {
    const shape = monthlySpendShape(
      [expense('2026-06-10', 40000)],
      { start_date: '2027-01-01', end_date: '2026-01-31' },
      NOW,
    )
    expect(shape?.monthsCounted).toBe(1)
    expect(shape?.mean).toBe(40000)
  })
})

describe('monthlyAvgSubtitleFor', () => {
  it('names the mean and the typical month when the distribution is skewed', () => {
    // The real ledger's all-time shape: mean 43,190.00, median month 12,101.31.
    const subtitle = monthlyAvgSubtitleFor(
      { mean: 43190.0, median: 12101.31, monthsCounted: 90, monthsWithSpend: 89 },
      money,
    )
    expect(subtitle).toBe('Mean over 90 months (89 with spend); typical month is 12101.31')
  })

  it('states the divisor alone when a second number would not inform', () => {
    const subtitle = monthlyAvgSubtitleFor(
      { mean: 10000, median: 9800, monthsCounted: 3, monthsWithSpend: 3 },
      money,
    )
    expect(subtitle).toBe('Mean over 3 months')
  })

  it('agrees in singular for a one-month window', () => {
    const subtitle = monthlyAvgSubtitleFor(
      { mean: 5000, median: 5000, monthsCounted: 1, monthsWithSpend: 1 },
      money,
    )
    expect(subtitle).toBe('Mean over 1 month')
  })

  it('keeps generic copy rather than inventing a divisor when there is no data', () => {
    expect(monthlyAvgSubtitleFor(null, money)).toBe('Average spending per month')
  })
})

/**
 * The month spine is ONE function, because the KPI divisor and the trend bars
 * have to agree: the chart draws the KPI as its "Avg" reference line. When the
 * KPI spanned the selected window and the chart spanned only row-bearing months,
 * the line could sit below every bar it claimed to average.
 */
describe('spanMonthKeys', () => {
  it('spans the bounded window, not just the months carrying rows', () => {
    expect(spanMonthKeys(['2026-06'], { start_date: '2026-04-01', end_date: '2026-06-30' }, NOW))
      .toEqual(['2026-04', '2026-05', '2026-06'])
  })

  it('gives the trend series exactly the divisor the mean uses', () => {
    const range = { start_date: '2026-01-01', end_date: '2026-03-31' }
    const rows = [expense('2026-01-10', 20000), expense('2026-03-10', 10000)]
    const shape = monthlySpendShape(rows, range, NOW)
    const spine = spanMonthKeys(['2026-01', '2026-03'], range, NOW)
    expect(spine).toHaveLength(shape?.monthsCounted ?? 0)
    // Mean of the values the spine produces == the KPI, by construction.
    const byMonth: Record<string, number> = { '2026-01': 20000, '2026-03': 10000 }
    const bars = spine.map((m) => byMonth[m] ?? 0)
    expect(bars.reduce((s, v) => s + v, 0) / bars.length).toBeCloseTo(shape?.mean ?? 0, 6)
  })

  it('caps an open-ended window at the current month', () => {
    expect(spanMonthKeys(['2026-06', '2027-06'], { start_date: null, end_date: null }, NOW))
      .toEqual(['2026-06', '2026-07'])
  })

  it('falls back to the row months when the window spans none of them', () => {
    expect(spanMonthKeys(['2026-06'], { start_date: '2027-01-01', end_date: '2026-01-31' }, NOW))
      .toEqual(['2026-06'])
  })

  it('returns nothing when there are no rows to describe', () => {
    expect(spanMonthKeys([], { start_date: '2026-01-01', end_date: '2026-03-31' }, NOW)).toEqual([])
  })
})

describe('monthlyAvgLineLabelFor', () => {
  it('discloses the divisor, which a bare "Avg" cannot', () => {
    const label = monthlyAvgLineLabelFor(
      { mean: 23333.333, median: 0, monthsCounted: 3, monthsWithSpend: 1 },
      money,
      23333.333,
    )
    // The old label was `Avg: 23333.33` -- a number with no stated basis, drawn
    // beneath a single 70,000.00 bar.
    expect(label).toBe('Avg/mo over 3: 23333.33')
    expect(label).not.toBe('Avg: 23333.33')
  })

  it('falls back to the plain label when there is no shape to describe', () => {
    expect(monthlyAvgLineLabelFor(null, money, 0)).toBe('Avg: 0.00')
  })
})
