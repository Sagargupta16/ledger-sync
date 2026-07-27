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

import { renderHook } from '@testing-library/react'
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
  } as unknown as Transaction
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

vi.mock('@/hooks/api/useAnalytics', () => ({
  useAccountBalances: () => ({
    data: balances,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

vi.mock('@/hooks/api/useTransactions', () => ({
  useTransactions: () => ({
    data: transactionsRef.current,
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
    // Two clean +100,000 deltas. Uncapped: 70,000. Capped-only: 50,000.
    expect(result.current.monthlyGrowth).toBe(100000)
    expect(result.current.growthUsesPartialMonth).toBe(false)
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
 * `computeLinearGrowthStats` buckets by YYYY-MM and needs 3 buckets to form 2
 * deltas, returning `{growth: 0, sigma: 0}` below that. Dropping the in-progress
 * month leaves 2 buckets, so the growth came back 0 -- which `chartData` reads as
 * "no projection" (`monthlyGrowth <= 0`) and `buildMilestoneRows` reads as "no
 * ETA". A user about a quarter into their history lost the whole projection
 * feature to a guard meant to make it more honest, with nothing on screen saying
 * why. The fallback keeps the feature and the notice states the basis.
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
    // Falls back to the capped-at-today series: 100k -> 200k -> 300k, two
    // +100,000 deltas. Complete-months-only leaves 2 buckets and gives 0.
    expect(result.current.monthlyGrowth).toBe(100000)
    expect(result.current.growthUsesPartialMonth).toBe(true)
  })

  it('keeps the projection overlay and the milestone ETAs alive', () => {
    const { result } = renderHook(() => useNetWorth(), { wrapper })
    const upcomingWithEta = result.current.milestoneRows.filter(
      (row) => row.status === 'upcoming' && row.date !== null,
    )
    expect(upcomingWithEta.length).toBeGreaterThan(0)
  })
})
