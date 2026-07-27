/**
 * Pins the DIVISOR of every monthly average on Trends & Forecasts: which months
 * the numerator sums over, and whether the denominator counts the same set.
 *
 * ONE live mismatch, reproduced against the real ledger:
 *
 *   The "3m avg" line divided by its own truncated window, so its leading points
 *   were a 1-month and a 2-month mean wearing a 3-month label. On the real
 *   all-time series point 0 plotted 5,000.00 and point 1 plotted 2,500.00; on the
 *   default FY window they plotted 225,835.32 and 225,311.86. None of the four is
 *   a 3-month mean.
 *
 * The rest are REGRESSION PINS, not defects observed live:
 *
 *  - Future MONTH buckets. `dropPartialMonth` removes only the CURRENT month, so
 *    a bucket dated a month out would survive it and become `latest`. The live
 *    workbook has none (`substr(date,1,7) > '2026-07'` returns 0 rows; its one
 *    forward-dated accrual, 3,600 on 2026-07-31, is inside the current month and
 *    was already dropped), so the 3,600 / -98.54% figures below belong to the
 *    SYNTHETIC `2026-08` fixture, not to a measurement.
 *  - Dividing by the contributing-month count (already true via array length).
 *  - Excluding the partial trailing month (landed in 59d76f3).
 *  - The zero-divisor guard.
 *
 * Each is one careless edit away from breaking, which is why they are here.
 *
 * The reference date is injected with fake timers, never read from the clock,
 * so these assertions hold on any calendar day.
 */

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Transaction } from '@/types'

import { useTrendsForecasts } from '../useTrendsForecasts'

interface MonthlyTrend {
  month: string
  income: number
  expenses: number
  surplus: number
}

const monthlyTrends: MonthlyTrend[] = []
const transactions: Transaction[] = []

function month(m: string, income: number, expenses: number): MonthlyTrend {
  return { month: m, income, expenses, surplus: income - expenses }
}

/** Minimal transaction for the cumulative daily series. */
function tx(date: string, amount: number, type: 'Income' | 'Expense'): Transaction {
  return {
    id: `t-${date}-${type}`,
    date,
    amount,
    type,
    category: type === 'Income' ? 'Employment Income' : 'Housing',
    account: 'Bank A',
  } as unknown as Transaction
}

/** Replace the mocked API payloads for the next `renderHook`. */
function seed(months: MonthlyTrend[], txns: Transaction[] = []): void {
  monthlyTrends.length = 0
  monthlyTrends.push(...months)
  transactions.length = 0
  transactions.push(...txns)
}

vi.mock('@/hooks/api/useAnalytics', () => ({
  useTrends: () => ({
    data: { monthly_trends: monthlyTrends, surplus_trend: [], consistency_score: 0 },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

vi.mock('@/hooks/api/useTransactions', () => ({
  useTransactions: () => ({
    data: transactions,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

vi.mock('@/hooks/api/usePreferences', () => ({
  usePreferences: () => ({
    data: { fiscal_year_start_month: 4, savings_goal_percent: 20 },
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
}))

describe('useTrendsForecasts -- monthly average divisors', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // 2026-07-26: the real reference day. July is 26 of 31 days in.
    vi.setSystemTime(new Date(2026, 6, 26))
  })

  afterEach(() => {
    vi.useRealTimers()
    seed([])
  })

  it('averages a 3-month series over 3 months, not 12', () => {
    seed([
      month('2026-04', 300000, 90000),
      month('2026-05', 300000, 90000),
      month('2026-06', 300000, 120000),
    ])

    const { result } = renderHook(() => useTrendsForecasts())

    // 300,000 x 3 / 3 = 300,000. Divided by a hardcoded 12 it reads 75,000.
    expect(result.current.metrics.income.average).toBeCloseTo(300000, 6)
    // (90,000 + 90,000 + 120,000) / 3 = 100,000, not 25,000.
    expect(result.current.metrics.spending.average).toBeCloseTo(100000, 6)
    expect(result.current.metrics.savings.average).toBeCloseTo(200000, 6)
    expect(result.current.averageMonthCount).toBe(3)
  })

  it('excludes the partial trailing month from the average basis', () => {
    seed([
      month('2026-05', 200000, 100000),
      month('2026-06', 200000, 100000),
      // July is 26/31 days in: salary has not landed, rent has debited.
      month('2026-07', 13511, 107652),
    ])

    const { result } = renderHook(() => useTrendsForecasts())

    // Averaging the partial month in drags income to 137,837.
    expect(result.current.metrics.income.average).toBeCloseTo(200000, 6)
    expect(result.current.metrics.income.current).toBe(200000)
    expect(result.current.averageMonthCount).toBe(2)
    expect(result.current.partialMonth).toEqual({
      label: 'Jul 2026',
      daysElapsed: 26,
      daysTotal: 31,
    })
    // The excluded month must not reach the chart or the breakdown table.
    expect(result.current.monthlyTrendWithAvg.map((d) => d.month)).not.toContain('2026-07')
    expect(result.current.recentChartData.map((d) => d.month)).not.toContain('2026-07')
  })

  it('excludes a FUTURE month bucket from the average and the MoM basis', () => {
    // SYNTHETIC guard: the live ledger holds no bucket past the current month.
    // May/June amounts are the real ones so the shape matches; the 2026-08 row is
    // invented to exercise the path dropPartialMonth cannot cover on its own.
    seed([
      month('2026-05', 224788, 83633),
      month('2026-06', 246191, 108508),
      month('2026-08', 3600, 0),
    ])

    const { result } = renderHook(() => useTrendsForecasts())

    expect(result.current.metrics.income.current).toBe(246191)
    // With the future bucket as `latest`: (3,600 - 246,191) / 246,191 = -98.54%.
    expect(result.current.metrics.income.changePercent).toBeCloseTo(9.52, 1)
    // Three buckets over two real months read 158,193.67.
    expect(result.current.metrics.income.average).toBeCloseTo(235489.5, 1)
    expect(result.current.averageMonthCount).toBe(2)
  })

  it('labels a rolling 3-month average only where 3 months exist', () => {
    seed([
      month('2026-02', 5000, 40),
      month('2026-03', 0, 400),
      month('2026-04', 500, 0),
      month('2026-05', 590, 35),
    ])

    const { result } = renderHook(() => useTrendsForecasts())
    const series = result.current.monthlyTrendWithAvg

    // Points 0 and 1 previously plotted 5,000.00 and 2,500.00 under a "3m avg"
    // legend -- a 1-month and a 2-month mean respectively.
    expect(series[0].incomeAvg).toBeUndefined()
    expect(series[1].incomeAvg).toBeUndefined()
    expect(series[0].expensesAvg).toBeUndefined()
    expect(series[1].expensesAvg).toBeUndefined()
    // (5,000 + 0 + 500) / 3
    expect(series[2].incomeAvg).toBeCloseTo(1833.333333, 4)
    // (0 + 500 + 590) / 3 -- a full window that slides, never widens.
    expect(series[3].incomeAvg).toBeCloseTo(363.333333, 4)
    expect(result.current.rollingAvgMonths).toBe(3)
  })

  /**
   * The regression that slipped through the first attempt at this fix: honest
   * `undefined` leading points mean a 3-completed-month window -- what the
   * default FY view shows on the real ledger -- yields exactly ONE average
   * point, and Recharts strokes nothing through one point (`M x,y Z`). Counting
   * the points is what lets the page stop advertising an invisible line.
   */
  it('counts the rolling-average points so a lone one is not called a line', () => {
    seed([
      month('2026-04', 225835, 77701),
      month('2026-05', 224788, 83633),
      month('2026-06', 246191, 108508),
    ])

    const { result } = renderHook(() => useTrendsForecasts())
    const defined = result.current.monthlyTrendWithAvg.filter(
      (d) => d.incomeAvg !== undefined,
    )

    expect(result.current.rollingAvgPointCount).toBe(1)
    expect(defined).toHaveLength(1)
    // (225,835 + 224,788 + 246,191) / 3
    expect(defined[0].incomeAvg).toBeCloseTo(232271.333333, 4)

    seed([
      month('2026-03', 220302, 88956),
      month('2026-04', 225835, 77701),
      month('2026-05', 224788, 83633),
      month('2026-06', 246191, 108508),
    ])
    const four = renderHook(() => useTrendsForecasts())
    // Two points is the first width Recharts can actually stroke.
    expect(four.result.current.rollingAvgPointCount).toBe(2)
  })

  it('reports zero rolling-average points below the window width', () => {
    seed([month('2026-05', 224788, 83633), month('2026-06', 246191, 108508)])

    const { result } = renderHook(() => useTrendsForecasts())

    expect(result.current.rollingAvgPointCount).toBe(0)
    expect(result.current.monthlyTrendWithAvg).toHaveLength(2)
  })

  it('produces no NaN or Infinity for an empty series', () => {
    seed([])

    const { result } = renderHook(() => useTrendsForecasts())
    const { metrics } = result.current

    for (const metric of [metrics.income, metrics.spending, metrics.savings]) {
      expect(Number.isFinite(metric.average)).toBe(true)
      expect(metric.average).toBe(0)
      expect(Number.isFinite(metric.changePercent)).toBe(true)
    }
    expect(result.current.monthlyTrendWithAvg).toEqual([])
    expect(result.current.recentChartData).toEqual([])
    expect(result.current.dailySavingsData).toEqual([])
    expect(result.current.peakIncome).toBe(0)
    expect(result.current.peakSavings).toBe(0)
    expect(result.current.averageMonthCount).toBe(0)
    expect(result.current.rollingAvgPointCount).toBe(0)
  })

  it('produces no NaN when only the partial month has data', () => {
    seed([month('2026-07', 13511, 107652)])

    const { result } = renderHook(() => useTrendsForecasts())

    // Nothing complete to average: an empty state, not a divide-by-zero.
    expect(result.current.metrics.income.average).toBe(0)
    expect(Number.isNaN(result.current.metrics.spending.average)).toBe(false)
    expect(result.current.partialMonth?.label).toBe('Jul 2026')
    expect(result.current.averageMonthCount).toBe(0)
  })

  /**
   * The cumulative daily series used to plot `Math.max(0, rate)` while carrying
   * the true figure alongside as `rawSavingsRate` for the tooltip only, so a
   * deficit day sat flat on the axis while hovering it read "(deficit)". The
   * clamp was reachable on real data -- the live all-time series flatlines on
   * 6 of 1,515 days, first 2020-12-16 at -3.03% (measured read-only
   * 2026-07-27) -- and a shorter window makes it likelier, since an early
   * cumulative sum is the one a single large expense can outrun.
   */
  it('publishes a cumulative deficit as the negative rate it is', () => {
    seed([month('2026-06', 100000, 130000)], [
      tx('2026-06-05', 100000, 'Income'),
      tx('2026-06-20', 130000, 'Expense'),
    ])

    const { result } = renderHook(() => useTrendsForecasts())
    const series = result.current.dailySavingsData

    // 100,000 in then 130,000 out: +100% on the 5th, -30% on the 20th.
    expect(series.at(0)?.savingsRate).toBeCloseTo(100, 6)
    expect(series.at(-1)?.savingsRate).toBeCloseTo(-30, 6)
    // Clamped, the deficit day read 0 -- indistinguishable from breaking even.
    expect(series.at(-1)?.savingsRate).toBeLessThan(0)
  })
})
