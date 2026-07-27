/**
 * Guards `hasCurrentValueOverride`, the gate that decides whether the Total
 * Return / XIRR tiles show a figure or a prompt.
 *
 * Two ways to fake a return here, both of which shipped:
 * 1. No user input at all -- `effectiveCurrentValue` falls back to the book
 *    balance, which is the same cash flows the denominator is built from, so the
 *    "gain" is a rounding residue (measured 1,311.43 on 911,000 = +0.14%).
 * 2. A user value with no contribution history -- the percent guard returns 0 and
 *    the tile prints a confident "+0.00%" on a zero denominator (seen live at
 *    /demo after entering 1,050,000 against 0 contributions).
 */

import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Transaction } from '@/types'

import { useMutualFundProjection } from '../useMutualFundProjection'

const MF_ACCOUNT = 'Groww Mutual Funds'

const balances = {
  accounts: { [MF_ACCOUNT]: { balance: 912311.43 }, 'SBI Savings': { balance: 50000 } },
}

function transfer(date: string, amount: number): Transaction {
  return {
    id: `t-${date}`,
    date,
    amount,
    type: 'Transfer',
    category: 'Investments',
    account: 'SBI Savings',
    from_account: 'SBI Savings',
    to_account: MF_ACCOUNT,
    note: 'Monthly SIP',
  } as unknown as Transaction
}

vi.mock('@/hooks/api/useAnalytics', () => ({
  useAccountBalances: () => ({ data: balances, isLoading: false, isError: false, refetch: vi.fn() }),
}))

const transactionsRef: { current: Transaction[] } = { current: [] }

vi.mock('@/hooks/api/useTransactions', () => ({
  useTransactions: () => ({
    data: transactionsRef.current,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

vi.mock('@/services/api/accountClassifications', () => ({
  accountClassificationsService: {
    getAccountsByType: async () => ({ accounts: [MF_ACCOUNT] }),
  },
}))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useMutualFundProjection -- hasCurrentValueOverride', () => {
  beforeEach(() => {
    transactionsRef.current = [transfer('2024-08-01', 35000), transfer('2024-09-01', 35000)]
  })

  it('is false with no user input, so the book balance is never shown as a return', async () => {
    const { result } = renderHook(() => useMutualFundProjection(), { wrapper })
    await waitFor(() => expect(result.current.totalHistoricalInvested).toBe(70000))
    expect(result.current.hasCurrentValueOverride).toBe(false)
    // The residue is still computed for the "Effective Value" tile, and it is
    // exactly the artefact that used to be labelled a gain.
    expect(result.current.overrideGains).toBeCloseTo(912311.43 - 70000, 2)
  })

  it('is true once a market value AND a contribution base both exist', async () => {
    const { result } = renderHook(() => useMutualFundProjection(), { wrapper })
    await waitFor(() => expect(result.current.totalHistoricalInvested).toBe(70000))
    act(() => result.current.setCurrentValueInput(80000))
    await waitFor(() => expect(result.current.hasCurrentValueOverride).toBe(true))
    expect(result.current.overrideGainsPercent).toBeCloseTo((10000 / 70000) * 100, 6)
  })

  it('stays false when a value is entered but nothing was ever contributed', async () => {
    transactionsRef.current = []
    const { result } = renderHook(() => useMutualFundProjection(), { wrapper })
    await waitFor(() => expect(result.current.totalHistoricalInvested).toBe(0))
    act(() => result.current.setCurrentValueInput(1050000))
    await waitFor(() => expect(result.current.currentValueInput).toBe(1050000))
    // Reverting the fix to `currentValueInput > 0` makes this true and the page
    // prints "+0.00%" on a zero denominator.
    expect(result.current.hasCurrentValueOverride).toBe(false)
    expect(result.current.overrideGainsPercent).toBe(0)
  })

  it('exposes no realized-gain figure at all', async () => {
    const { result } = renderHook(() => useMutualFundProjection(), { wrapper })
    await waitFor(() => expect(result.current.totalHistoricalInvested).toBe(70000))
    const keys = Object.keys(result.current)
    expect(keys.filter((k) => /^realizedGains/.test(k))).toEqual([])
  })
})
