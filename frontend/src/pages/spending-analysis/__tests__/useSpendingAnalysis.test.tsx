/**
 * Guards the totals-vs-rates split on the Expense Analysis page.
 *
 * On 2026-07-27 the real ledger had July rent already debited and salary not yet
 * credited. Mixed into the same window as completed months, the 50/30/20 card
 * read Needs 1015.3% of income for the month and 47.9% for the FY where the
 * completed months give 34.1%, and the monthly average spend came out 94,373.35
 * (4-month divisor over 3 real months) against a true 89,947.25. Measured on the
 * non-deleted rows the API returns, with the stored `essential_categories`.
 *
 * The split: Total Spending keeps the in-progress month (what the user has
 * actually spent so far), every share and average runs on completed months --
 * unless NOTHING is left after that narrowing, in which case the page keeps the
 * real running-pace numbers and says so rather than rendering zeroes.
 *
 * The reference date is injected via fake timers, not read from the clock.
 */

import type { ReactNode } from 'react'

import { act, renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Transaction } from '@/types'

import { useSpendingAnalysis } from '../useSpendingAnalysis'

function tx(
  date: string,
  amount: number,
  type: 'Income' | 'Expense',
  category: string,
): Transaction {
  return {
    id: `t-${date}-${category}-${amount}`,
    date,
    amount,
    type,
    category,
    account: 'SBI Savings',
  } as unknown as Transaction
}

/**
 * Apr-Jun: 100,000 income, 30,000 Housing (essential) + 10,000 Shopping each.
 * July (26 of 31 days): rent debited, salary pending. Completed-months shares
 * are Needs 30% / Wants 10% / Savings 60%; drag July in and Needs becomes 40%
 * of a 300,000 denominator with savings floored at 0.
 */
const TRANSACTIONS: Transaction[] = [
  tx('2026-04-05', 100000, 'Income', 'Employment Income'),
  tx('2026-04-06', 30000, 'Expense', 'Housing'),
  tx('2026-04-07', 10000, 'Expense', 'Shopping'),
  tx('2026-05-05', 100000, 'Income', 'Employment Income'),
  tx('2026-05-06', 30000, 'Expense', 'Housing'),
  tx('2026-05-07', 10000, 'Expense', 'Shopping'),
  tx('2026-06-05', 100000, 'Income', 'Employment Income'),
  tx('2026-06-06', 30000, 'Expense', 'Housing'),
  tx('2026-06-07', 10000, 'Expense', 'Shopping'),
  tx('2026-07-06', 30000, 'Expense', 'Housing'),
]

const transactionsRef: { current: Transaction[] } = { current: TRANSACTIONS }

vi.mock('@/hooks/api/useTransactions', () => ({
  useTransactions: () => ({
    data: transactionsRef.current,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

vi.mock('@/hooks/api/usePreferences', () => ({
  usePreferences: () => ({
    data: {
      fiscal_year_start_month: 4,
      essential_categories: ['Housing'],
      needs_target_percent: 50,
      wants_target_percent: 30,
      savings_target_percent: 20,
    },
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
}))

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

describe('useSpendingAnalysis -- in-progress month', () => {
  beforeEach(() => {
    transactionsRef.current = TRANSACTIONS
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 6, 26))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the partial month in Total Spending', () => {
    const { result } = renderHook(() => useSpendingAnalysis(), { wrapper })
    // 3 x 40,000 completed + 30,000 of July rent.
    expect(result.current.totalSpending).toBe(150000)
  })

  it('computes the budget-rule shares on completed months only', () => {
    const { result } = renderHook(() => useSpendingAnalysis(), { wrapper })
    // Needs 90,000 / income 300,000. With July: 120,000 / 300,000 = 40%.
    expect(result.current.budgetRuleMetrics?.essentialPercent).toBeCloseTo(30, 6)
    expect(result.current.budgetRuleMetrics?.discretionaryPercent).toBeCloseTo(10, 6)
    expect(result.current.budgetRuleMetrics?.savingsPercent).toBeCloseTo(60, 6)
    expect(result.current.savings).toBe(180000)
  })

  it('divides the monthly average by completed months only', () => {
    const { result } = renderHook(() => useSpendingAnalysis(), { wrapper })
    // 120,000 / 3. With July: 150,000 / 4 = 37,500.
    expect(result.current.monthlyAvgSpending).toBe(40000)
  })

  it('excludes the stub month from the expense trend', () => {
    const { result } = renderHook(() => useSpendingAnalysis(), { wrapper })
    expect(result.current.monthlyTrendData.map((d) => d.month)).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
    ])
  })

  it('surfaces the in-progress month so the narrowing is stated', () => {
    const { result } = renderHook(() => useSpendingAnalysis(), { wrapper })
    expect(result.current.partialPeriod).toEqual({
      monthKey: '2026-07',
      label: 'Jul 2026',
      daysElapsed: 26,
      daysTotal: 31,
    })
    expect(result.current.noCompleteMonthBasis).toBe(false)
  })

  it('uses the whole window once the current month completes', () => {
    vi.setSystemTime(new Date(2026, 6, 31))
    const { result } = renderHook(() => useSpendingAnalysis(), { wrapper })
    expect(result.current.partialPeriod).toBeNull()
    expect(result.current.monthlyAvgSpending).toBe(37500)
    expect(result.current.budgetRuleMetrics?.essentialPercent).toBeCloseTo(40, 6)
  })
})

/**
 * The "3-month rolling average" has to be a 3-month average.
 *
 * The window was `slice(max(0, i - 2), i + 1)` divided by its own length, so the
 * first two points divided by 1 and 2 while the legend, the tooltip and the
 * chart's ariaLabel all read "3-month rolling average". Measured on the real
 * ledger over the DEFAULT FY window (2026-04..2026-06, exactly three complete
 * months, so all three points are visible at once): 2026-04 plotted 77,700.92 --
 * its own monthly spend, redrawn as a trend -- 2026-05 plotted 80,666.86 from a
 * two-month window, and only 2026-06's 89,947.25 was a real three-month mean.
 *
 * Emitting `undefined` for a short window leaves FEWER average points than data
 * points, and recharts strokes `M x,y Z` for a single defined point -- a moveto
 * plus closepath that paints nothing. Three complete months is precisely that
 * case, so `rollingAvgPointCount` travels with the series and the section renders
 * a dot plus a caption that says what is on screen.
 */
const FY_REAL: Transaction[] = [
  tx('2026-04-05', 200000, 'Income', 'Employment Income'),
  tx('2026-04-10', 77700.92, 'Expense', 'Housing'),
  tx('2026-05-05', 200000, 'Income', 'Employment Income'),
  tx('2026-05-10', 83632.81, 'Expense', 'Housing'),
  tx('2026-06-05', 200000, 'Income', 'Employment Income'),
  tx('2026-06-10', 108508.01, 'Expense', 'Housing'),
]

describe('useSpendingAnalysis -- rolling average window', () => {
  beforeEach(() => {
    transactionsRef.current = FY_REAL
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 6, 27))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('withholds an average until three months exist', () => {
    const { result } = renderHook(() => useSpendingAnalysis(), { wrapper })
    const avgs = result.current.monthlyTrendData.map((d) => d.expenseAvg)
    expect(avgs).toHaveLength(3)
    // Old code plotted 77,700.92 and 80,666.86 here and labelled them "3m avg".
    expect(avgs[0]).toBeUndefined()
    expect(avgs[1]).toBeUndefined()
    expect(avgs[2]).toBeCloseTo(89947.25, 2)
  })

  it('reports how many average points exist so a lone point is not an invisible line', () => {
    const { result } = renderHook(() => useSpendingAnalysis(), { wrapper })
    expect(result.current.rollingAvgPointCount).toBe(1)
    expect(result.current.rollingAvgMonths).toBe(3)
  })

  it('keeps a zero-spend month on the spine instead of reaching further back', () => {
    // The real ledger's 2019-03: no expense row between two months that have one.
    // Sliding a 3-element window over the gappy list averaged Feb/Apr/May and
    // published 654.33 where those three calendar months average 521.00 (+25.6%),
    // and the x-axis jumped Feb to Apr at even spacing as though no time passed.
    transactionsRef.current = [
      tx('2026-04-05', 200000, 'Income', 'Employment Income'),
      tx('2026-04-10', 40, 'Expense', 'Housing'),
      // 2026-05 carries no expense -- the gap.
      tx('2026-05-05', 200000, 'Income', 'Employment Income'),
      tx('2026-06-05', 200000, 'Income', 'Employment Income'),
      tx('2026-06-10', 395, 'Expense', 'Housing'),
    ]
    const { result } = renderHook(() => useSpendingAnalysis(), { wrapper })
    const trend = result.current.monthlyTrendData
    expect(trend.map((d) => d.month)).toEqual(['2026-04', '2026-05', '2026-06'])
    expect(trend[1].expense).toBe(0)
    // (40 + 0 + 395) / 3. The gappy 2-element list produced no average point at
    // all here, and with one more month behind it would have averaged across
    // four calendar months while the label still said three.
    expect(trend[2].expenseAvg).toBeCloseTo(145, 6)
    expect(result.current.rollingAvgPointCount).toBe(1)
  })

  it('reports no average points at all below the window length', () => {
    // Two complete months only. They are the LAST two, because the default
    // all-time window ends at the last complete month (2026-06) and the spine
    // runs to it -- starting in April would make this a three-month span with a
    // zero-spend June, which is a different case (see the spine test above).
    transactionsRef.current = [
      tx('2026-05-05', 200000, 'Income', 'Employment Income'),
      tx('2026-05-10', 77700.92, 'Expense', 'Housing'),
      tx('2026-06-10', 83632.81, 'Expense', 'Housing'),
    ]
    const { result } = renderHook(() => useSpendingAnalysis(), { wrapper })
    expect(result.current.monthlyTrendData.map((d) => d.expenseAvg)).toEqual([undefined, undefined])
    expect(result.current.rollingAvgPointCount).toBe(0)
  })

  it('divides the monthly average by the three calendar months, matching the last average point', () => {
    const { result } = renderHook(() => useSpendingAnalysis(), { wrapper })
    expect(result.current.monthlyAvgSpending).toBeCloseTo(89947.25, 2)
    expect(result.current.monthlyAvgSubtitle).toContain('Mean over 3 months')
  })
})

/**
 * The "Avg" reference line the Expense Trend draws IS the mean of the bars it is
 * drawn over.
 *
 * The KPI divisor moved to every calendar month in the window while the chart
 * still plotted only the months carrying a row, so the two disagreed whenever the
 * window was BOUNDED and the spend did not reach its start. On the default
 * all-time view they happen to agree (no start date, so both begin at the first
 * row), which is why this case needs a selected FY -- the same window the page
 * ships as its non-default. Reproduced this session on a yearly window whose rows
 * start mid-year: 7 bars of 70,000.00 above an Avg line at 40,833.33, labelled as
 * their average. The spine is now shared ({@link spanMonthKeys}), so agreement is
 * structural, and the empty months it adds are real zero-spend months the axis
 * should show.
 */
describe('useSpendingAnalysis -- Avg line vs the bars it averages', () => {
  beforeEach(() => {
    transactionsRef.current = [
      tx('2026-04-05', 200000, 'Income', 'Employment Income'),
      tx('2026-05-05', 200000, 'Income', 'Employment Income'),
      tx('2026-06-05', 200000, 'Income', 'Employment Income'),
      // Spend lands only in the window's last complete month.
      tx('2026-06-10', 70000, 'Expense', 'Housing'),
    ]
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 6, 27))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** FY 2026 = 2026-04-01..2027-03-31, capped at today, complete months to Jun. */
  function renderOnFY() {
    const rendered = renderHook(() => useSpendingAnalysis(), { wrapper })
    act(() => {
      rendered.result.current.timeFilterProps.onViewModeChange('fy')
    })
    return rendered
  }

  it('plots the empty months the divisor counts', () => {
    const { result } = renderOnFY()
    // Old spine: ['2026-06'] alone, one bar for a three-month divisor.
    expect(result.current.monthlyTrendData.map((d) => d.month)).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
    ])
    expect(result.current.monthlyTrendData.map((d) => d.expense)).toEqual([0, 0, 70000])
  })

  it('draws the line at the arithmetic mean of the plotted bars', () => {
    const { result } = renderOnFY()
    const bars = result.current.monthlyTrendData.map((d) => d.expense)
    const meanOfBars = bars.reduce((s, v) => s + v, 0) / bars.length
    expect(result.current.monthlyAvgSpending).toBeCloseTo(meanOfBars, 6)
    // 70,000 / 3 calendar months. Old code drew this same line under a single
    // 70,000.00 bar.
    expect(result.current.monthlyAvgSpending).toBeCloseTo(23333.33, 2)
  })

  it('never leaves every bar on one side of its own average', () => {
    const { result } = renderOnFY()
    const bars = result.current.monthlyTrendData.map((d) => d.expense)
    const line = result.current.monthlyAvgSpending
    expect(bars.some((v) => v <= line)).toBe(true)
    expect(bars.some((v) => v >= line)).toBe(true)
  })

  it('names the divisor on the on-chart label, which has no room for the subtitle', () => {
    const { result } = renderOnFY()
    // A bare "Avg: X" cannot say what X averaged; the count travels with it.
    expect(result.current.monthlyAvgLineLabel).toContain('Avg/mo over 3')
    expect(result.current.monthlyAvgLineLabel).not.toMatch(/^Avg: /)
  })
})

/**
 * The narrowing has nothing to fall back on: everything the user has uploaded
 * sits inside the month in progress.
 *
 * `defaultTimeRange` ships as `all_time`, whose comparable range ends at the
 * previous month-end, so this is the FIRST screen a user one month in sees. With
 * no fallback, `totalIncome` came back 0, which makes both
 * `buildSpendingChartData` and `computeBudgetRuleMetrics` bail (`totalIncome <=
 * 0`), and `BudgetRuleAnalysis` then rendered an EmptyState telling the user to
 * "Configure essential categories in Settings" -- blaming a setting that was
 * fine.
 */
const JULY_ONLY: Transaction[] = [
  tx('2026-07-05', 100000, 'Income', 'Employment Income'),
  tx('2026-07-06', 30000, 'Expense', 'Housing'),
  tx('2026-07-07', 10000, 'Expense', 'Shopping'),
]

describe('useSpendingAnalysis -- nothing survives the narrowing', () => {
  beforeEach(() => {
    transactionsRef.current = JULY_ONLY
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 6, 26))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the real running-pace shares instead of collapsing to zero', () => {
    const { result } = renderHook(() => useSpendingAnalysis(), { wrapper })
    expect(result.current.budgetRuleMetrics).not.toBeNull()
    expect(result.current.budgetRuleMetrics?.essentialPercent).toBeCloseTo(30, 6)
    expect(result.current.budgetRuleMetrics?.discretionaryPercent).toBeCloseTo(10, 6)
    expect(result.current.budgetRuleMetrics?.savingsPercent).toBeCloseTo(60, 6)
  })

  it('still renders the budget-rule chart rather than a misleading empty state', () => {
    const { result } = renderHook(() => useSpendingAnalysis(), { wrapper })
    // Non-empty is what keeps BudgetRuleAnalysis off its "Configure essential
    // categories in Settings" EmptyState.
    expect(result.current.spendingChartData).toHaveLength(3)
    expect(result.current.monthlyAvgSpending).toBe(40000)
    expect(result.current.monthlyTrendData.map((d) => d.month)).toEqual(['2026-07'])
  })

  it('flags the partial-only basis so the notice says running pace', () => {
    const { result } = renderHook(() => useSpendingAnalysis(), { wrapper })
    expect(result.current.noCompleteMonthBasis).toBe(true)
    expect(result.current.partialPeriod?.monthKey).toBe('2026-07')
  })
})

/**
 * Same gap reached the other way: the window DOES hold complete months, but the
 * `?category=` deep-link picks a category whose only rows are in the month in
 * progress. The range-level flag is false here, which is exactly why the flag
 * alone was not enough.
 */
describe('useSpendingAnalysis -- category deep-link with only current-month rows', () => {
  beforeEach(() => {
    transactionsRef.current = [
      ...TRANSACTIONS,
      tx('2026-07-08', 5000, 'Expense', 'Gifts'),
    ]
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 6, 26))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function categoryWrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={['/?category=Gifts']}>{children}</MemoryRouter>
  }

  it('falls back to the current month and flags it', () => {
    const { result } = renderHook(() => useSpendingAnalysis(), {
      wrapper: categoryWrapper,
    })
    expect(result.current.categoryFilter).toBe('Gifts')
    expect(result.current.noCompleteMonthBasis).toBe(true)
    expect(result.current.totalSpending).toBe(5000)
    expect(result.current.monthlyAvgSpending).toBe(5000)
  })
})
