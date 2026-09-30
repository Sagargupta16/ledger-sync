/**
 * Guards the two date defects on the Net Worth page, both measured against the
 * real ledger on 2026-07-26 (July: 26 of 31 days elapsed):
 *
 * 1. A future-dated row (a real EPF accrual booked 2026-07-31) sat at the end of
 *    the cumulative series, so the last trend point showed money not yet
 *    received and the chart drew its "Now" marker five days ahead of today.
 * 2. The in-progress month was compared against completed months, reporting a
 *    -4.5% net-worth MoM where the last completed month was +7.4%, and pulling
 *    the growth model (which drives every milestone ETA) off a stub delta.
 *
 * The reference date is injected via fake timers, never read from the clock, so
 * the assertions hold on the 1st and the 31st alike.
 */

import type { ReactNode } from 'react'

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Transaction } from '@/types'

import { useNetWorth } from '../useNetWorth'

const balances = {
  accounts: {
    'SBI Savings': { balance: 200000, transactions: 4 },
    'HDFC Credit Card': { balance: -20000, transactions: 1 },
  },
}

function tx(date: string, amount: number, type: 'Income' | 'Expense'): Transaction {
  return {
    id: `t-${date}`,
    date,
    amount,
    type,
    category: type === 'Income' ? 'Employment Income' : 'Housing',
    account: 'SBI Savings',
  }
}

/**
 * Cumulative net worth by month-end:
 *   Apr  50,000 | May 150,000 | Jun 250,000   <- complete months
 *   Jul 200,000 (to 10 Jul, partial) | Jul 260,000 (31 Jul, FUTURE)
 *
 * Each defect produces a different MoM, so the numbers below pin which basis is
 * in play: complete months +66.7%, capped-at-today -20%, uncapped +4%.
 */
const TRANSACTIONS: Transaction[] = [
  tx('2026-04-30', 50000, 'Income'),
  tx('2026-05-31', 100000, 'Income'),
  tx('2026-06-30', 100000, 'Income'),
  tx('2026-07-10', 50000, 'Expense'),
  tx('2026-07-31', 60000, 'Income'),
]

const transactionsRef: { current: Transaction[] } = { current: TRANSACTIONS }

/** The ledger above as `/daily-net-worth` days: Income/Expense sums per date. */
function dailyNetWorth(rows: readonly Transaction[]) {
  const days = new Map<string, { date: string; income: number; expense: number }>()
  for (const row of rows) {
    const day = days.get(row.date) ?? { date: row.date, income: 0, expense: 0 }
    if (row.type === 'Income') day.income += row.amount
    else if (row.type === 'Expense') day.expense += row.amount
    days.set(row.date, day)
  }
  let netWorth = 0
  const cumulative = [...days.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      netWorth += day.income - day.expense
      return { ...day, net_worth: netWorth }
    })
  return { daily_data: Object.fromEntries(days), cumulative_data: cumulative, opening_balance: 0 }
}

/** Every params object the page passed to `useAccountBalances`. */
const balanceParams: unknown[] = []

vi.mock('@/hooks/api/useAnalytics', () => ({
  useAccountBalances: (params?: unknown) => {
    balanceParams.push(params)
    return {
      data: balances,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }
  },
  useDataDateRange: () => {
    const dates = transactionsRef.current.map((row) => row.date).sort((a, b) => a.localeCompare(b))
    return {
      minDate: dates[0],
      maxDate: dates.at(-1),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }
  },
}))

// One response object per ledger, like a settled query, so memos stay stable.
const dailyCache = new WeakMap<readonly Transaction[], ReturnType<typeof dailyNetWorth>>()
function cachedDailyNetWorth(rows: Transaction[]) {
  const hit = dailyCache.get(rows) ?? dailyNetWorth(rows)
  dailyCache.set(rows, hit)
  return hit
}

vi.mock('@/hooks/api/useCalculations', () => ({
  useDailyNetWorth: () => ({
    data: cachedDailyNetWorth(transactionsRef.current),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

vi.mock('@/hooks/api/usePreferences', () => ({
  usePreferences: () => ({
    data: { fiscal_year_start_month: 4, investment_account_mappings: {} },
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
}))

vi.mock('@/hooks/api/useAccountClassifications', () => ({
  useAccountClassifications: () => ({
    data: { 'SBI Savings': 'Bank Accounts', 'HDFC Credit Card': 'Credit Cards' },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

function wrapper({ children }: { children: ReactNode }) {
  return <>{children}</>
}

describe('useNetWorth -- future rows and the in-progress month', () => {
  beforeEach(() => {
    transactionsRef.current = TRANSACTIONS
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 6, 26))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stops the historical series at today, dropping the future accrual', () => {
    const { result } = renderHook(() => useNetWorth(), { wrapper })
    // 2026-07-31 exists in the ledger and must not be the last point.
    expect(result.current.anchor).toEqual({ date: '2026-07-10', netWorth: 200000 })
    expect(result.current.filteredNetWorthData.at(-1)?.date).toBe('2026-07-10')
    expect(result.current.filteredNetWorthData.map((p) => p.date)).not.toContain('2026-07-31')
  })

  it('reports MoM on completed months, not the half-finished one', () => {
    const { result } = renderHook(() => useNetWorth(), { wrapper })
    // (250,000 - 150,000) / 150,000. Uncapped gives +4%, capped-only -20%.
    expect(result.current.netWorthMoMChange).toBe(66.7)
    expect(result.current.netWorthSparkline).toEqual([50000, 150000, 250000])
  })

  it('names the completed month the badge actually compares', () => {
    const { result } = renderHook(() => useNetWorth(), { wrapper })
    expect(result.current.netWorthMoMLabel).toBe('Jun 26 vs prior month')
  })

  it('builds the growth model from completed months only', () => {
    const { result } = renderHook(() => useNetWorth(), { wrapper })
    // Shared average monthly savings: Apr 50,000 + May 100,000 + Jun 100,000
    // over 3 complete months. July (in progress, and its future accrual) is out.
    expect(result.current.monthlyGrowth).toBeCloseTo(250000 / 3, 6)
  })

  it('reads the hero balances at the same ledger day the trend stops at', () => {
    balanceParams.length = 0
    renderHook(() => useNetWorth(), { wrapper })
    // Without an end date the balances summed the 2026-07-31 accrual the trend drops.
    expect(balanceParams.at(-1)).toEqual({ end_date: '2026-07-26' })
  })

  it('surfaces the in-progress month so the narrowing is stated', () => {
    const { result } = renderHook(() => useNetWorth(), { wrapper })
    expect(result.current.partialPeriod).toEqual({
      monthKey: '2026-07',
      label: 'Jul 2026',
      daysElapsed: 26,
      daysTotal: 31,
    })
  })

  it('keeps the current month once it is complete', () => {
    vi.setSystemTime(new Date(2026, 6, 31))
    const { result } = renderHook(() => useNetWorth(), { wrapper })
    expect(result.current.partialPeriod).toBeNull()
    // 31 Jul is now today, not the future, so it counts: 260,000 vs Jun 250,000.
    expect(result.current.anchor).toEqual({ date: '2026-07-31', netWorth: 260000 })
    expect(result.current.netWorthMoMChange).toBe(4)
  })
})

/**
 * Exactly three months of history, the third of them in progress.
 *
 * The old delta model needed 3 month buckets for 2 deltas, so dropping the
 * in-progress month zeroed the growth and killed the projection and every ETA.
 * The shared average monthly savings needs only one complete month, so the two
 * complete months carry the feature without touching the partial one.
 */
const THREE_MONTHS_ONE_PARTIAL: Transaction[] = [
  tx('2026-05-31', 100000, 'Income'),
  tx('2026-06-30', 100000, 'Income'),
  tx('2026-07-10', 100000, 'Income'),
]

describe('useNetWorth -- three months, the last one in progress', () => {
  beforeEach(() => {
    transactionsRef.current = THREE_MONTHS_ONE_PARTIAL
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 6, 26))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('still produces a growth rate instead of a silent zero', () => {
    const { result } = renderHook(() => useNetWorth(), { wrapper })
    // May and June, 100,000 each; the July stub is excluded.
    expect(result.current.monthlyGrowth).toBe(100000)
  })

  it('keeps the projection overlay and the milestone ETAs alive', () => {
    const { result } = renderHook(() => useNetWorth(), { wrapper })
    const upcomingWithEta = result.current.milestoneRows.filter(
      (row) => row.status === 'upcoming' && row.date !== null,
    )
    expect(upcomingWithEta.length).toBeGreaterThan(0)
  })
})

describe('useNetWorth -- sparse calendar history', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 15))
    transactionsRef.current = [
      tx('2026-01-31', 100_000, 'Income'),
      tx('2026-04-30', 30_000, 'Income'),
      tx('2026-07-31', 30_000, 'Income'),
    ]
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shares the calendar growth rate with projections and the completed-month sparkline', () => {
    const { result } = renderHook(() => useNetWorth(), { wrapper })
    // 160,000 saved over the 7 complete months Jan..Jul, empty months as zero.
    expect(result.current.monthlyGrowth).toBeCloseTo(160_000 / 7, 6)
    expect(result.current.netWorthSparkline).toEqual([
      100_000, 100_000, 100_000, 130_000, 130_000, 130_000, 160_000,
    ])
    expect(result.current.netWorthMoMLabel).toBe('Jul 26 vs prior month')
    expect(result.current.netWorthMoMChange).toBe(23.1)

    act(() => result.current.setShowProjection(true))
    const history = result.current.chartData.filter((point) => point.netWorth !== null)
    expect(history).toHaveLength(7)
    const projected = result.current.chartData.find((point) => point.date === '2026-08-31')?.projected
    expect(projected).toBeCloseTo(160_000 + 160_000 / 7, 6)
  })

  it('retains inactive completed months before dropping the current partial month', () => {
    vi.setSystemTime(new Date(2026, 6, 26))
    transactionsRef.current = [
      tx('2026-01-31', 100_000, 'Income'),
      tx('2026-04-30', 30_000, 'Income'),
      tx('2026-07-10', 50_000, 'Expense'),
    ]
    const { result } = renderHook(() => useNetWorth(), { wrapper })
    expect(result.current.anchor).toEqual({ date: '2026-07-10', netWorth: 80_000 })
    // 130,000 over the 6 complete months Jan..Jun; July's -50,000 is in progress.
    expect(result.current.monthlyGrowth).toBeCloseTo(130_000 / 6, 6)
    expect(result.current.netWorthSparkline).toEqual([
      100_000, 100_000, 100_000, 130_000, 130_000, 130_000,
    ])
    expect(result.current.netWorthMoMChange).toBe(0)
    expect(result.current.netWorthMoMLabel).toBe('Jun 26 vs prior month')
  })
})
