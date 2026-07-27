/**
 * Guards the future-row cap on the running savings-rate line.
 *
 * The ledger legitimately holds forward-dated accruals -- the real workbook books
 * an EPF contribution on 2026-07-31 while today is 2026-07-26. The cumulative
 * daily series ran to that row, so the last point (the value the card reads out)
 * counted money not yet received: 46.22% on the FY window against 45.95% as of
 * today, and 31.33% vs 31.30% all-time.
 *
 * The partial MONTH is deliberately kept here: this is a to-date cumulative
 * series, not a month-vs-month comparison, and the page already states the
 * caveat via `partialMonth`.
 *
 * The reference date is injected via fake timers, never read from the clock.
 */

import type { ReactNode } from 'react'

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Transaction } from '@/types'

import { useTrendsForecasts } from '../useTrendsForecasts'

function tx(date: string, amount: number, type: 'Income' | 'Expense'): Transaction {
  return {
    id: `t-${date}-${type}`,
    date,
    amount,
    type,
    category: type === 'Income' ? 'Employment Income' : 'Housing',
    account: 'SBI Savings',
  }
}

/**
 * Cumulative savings rate by day:
 *   30 Jun  (100,000 - 40,000) / 100,000 = 60%
 *   10 Jul  (100,000 - 70,000) / 100,000 = 30%   <- today's honest figure
 *   31 Jul  (200,000 - 70,000) / 200,000 = 65%   <- FUTURE accrual, must not show
 */
const TRANSACTIONS: Transaction[] = [
  tx('2026-06-30', 100000, 'Income'),
  tx('2026-06-30', 40000, 'Expense'),
  tx('2026-07-10', 30000, 'Expense'),
  tx('2026-07-31', 100000, 'Income'),
]

const TRENDS = {
  monthly_trends: [
    { month: '2026-05', income: 100000, expenses: 40000, surplus: 60000 },
    { month: '2026-06', income: 100000, expenses: 40000, surplus: 60000 },
    { month: '2026-07', income: 0, expenses: 30000, surplus: -30000 },
  ],
  surplus_trend: [],
  consistency_score: 80,
}

vi.mock('@/hooks/api/useAnalytics', () => ({
  useTrends: () => ({ data: TRENDS, isPending: false, isError: false, refetch: vi.fn() }),
}))

vi.mock('@/hooks/api/useTransactions', () => ({
  useTransactions: () => ({
    data: TRANSACTIONS,
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

function wrapper({ children }: { children: ReactNode }) {
  return <>{children}</>
}

describe('useTrendsForecasts -- future-dated rows', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 6, 26))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stops the running savings-rate line at today', () => {
    const { result } = renderHook(() => useTrendsForecasts(), { wrapper })
    const dates = result.current.dailySavingsData.map((d) => d.date)
    expect(dates).not.toContain('2026-07-31')
    expect(dates.at(-1)).toBe('2026-07-10')
  })

  it('reports the rate as of today, not as of the future accrual', () => {
    const { result } = renderHook(() => useTrendsForecasts(), { wrapper })
    // 30% today. With the 31 Jul income counted it reads 65%.
    expect(result.current.dailySavingsData.at(-1)?.savingsRate).toBeCloseTo(30, 6)
  })

  it('keeps the in-progress month -- this series is cumulative to date', () => {
    const { result } = renderHook(() => useTrendsForecasts(), { wrapper })
    expect(result.current.dailySavingsData.map((d) => d.date)).toContain('2026-07-10')
    expect(result.current.partialMonth).toEqual({
      label: 'Jul 2026',
      daysElapsed: 26,
      daysTotal: 31,
    })
  })

  it('includes the accrual once its date arrives', () => {
    vi.setSystemTime(new Date(2026, 6, 31))
    const { result } = renderHook(() => useTrendsForecasts(), { wrapper })
    expect(result.current.dailySavingsData.at(-1)?.date).toBe('2026-07-31')
    expect(result.current.dailySavingsData.at(-1)?.savingsRate).toBeCloseTo(65, 6)
  })

  /**
   * The series used to plot `Math.max(0, rate)` and carry the true figure
   * alongside as `rawSavingsRate` for the tooltip only, so a deficit day sat on
   * the axis while hovering it read "(deficit)" -- the chart contradicting its
   * own tooltip. Two fields meant two answers; one field cannot disagree with
   * itself. The negative VALUE is pinned in `useTrendsForecasts.test.ts`, whose
   * fixtures are per-test.
   */
  it('carries exactly one rate field per point', () => {
    const { result } = renderHook(() => useTrendsForecasts(), { wrapper })
    expect(result.current.dailySavingsData.length).toBeGreaterThan(0)
    for (const point of result.current.dailySavingsData) {
      expect([...Object.keys(point)].sort()).toEqual(['date', 'savingsRate'])
    }
  })
})
