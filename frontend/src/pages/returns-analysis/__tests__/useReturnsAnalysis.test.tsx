import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useReturnsAnalysis } from '../useReturnsAnalysis'

const mocks = vi.hoisted(() => ({
  balances: vi.fn(),
  transactions: vi.fn(),
  preferences: vi.fn(),
}))

vi.mock('@/hooks/api/useAnalytics', () => ({ useAccountBalances: mocks.balances }))
vi.mock('@/hooks/api/useTransactions', () => ({ useTransactions: mocks.transactions }))
vi.mock('@/hooks/api/usePreferences', () => ({ usePreferences: mocks.preferences }))
vi.mock('@/hooks/useAnalyticsTimeFilter', () => ({
  useAnalyticsTimeFilter: () => ({
    dateRange: { start_date: '2026-08-01', end_date: '2026-08-31' },
    timeFilterProps: {},
  }),
}))

const ready = { isLoading: false, isError: false, refetch: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.preferences.mockReturnValue({
    ...ready, data: { investment_account_mappings: { 'Long term': 'mutual_funds' } },
  })
  mocks.transactions.mockReturnValue({
    ...ready,
    data: [
      { id: 'opening', date: '2026-07-01', type: 'Transfer', amount: 10000, category: 'Transfer', account: 'Bank', from_account: 'Bank', to_account: 'Long term' },
      { id: 'redeemed', date: '2026-08-01', type: 'Transfer', amount: 4000, category: 'Transfer', account: 'Long term', from_account: 'Long term', to_account: 'Bank' },
      { id: 'interest', date: '2026-08-15', type: 'Income', amount: 100, category: 'Investment Income', subcategory: 'Interest', note: 'Realized FD interest', account: 'Bank' },
    ],
  })
  mocks.balances.mockReturnValue({
    ...ready,
    data: {
      accounts: {
        'Long term': { balance: 6000, transactions: 2 },
        'Stocks account': { balance: -1500, transactions: 1 },
        Bank: { balance: 4100, transactions: 2 },
      },
    },
  })
})

describe('useReturnsAnalysis investment contracts', () => {
  it('requests closing balances through the end date without dropping opening contributions', () => {
    const { result } = renderHook(() => useReturnsAnalysis())
    expect(mocks.balances).toHaveBeenCalledWith({ end_date: '2026-08-31' })
    expect(result.current.investmentAccounts).toEqual([
      { name: 'Long term', balance: 6000, transactions: 2 },
      { name: 'Stocks account', balance: -1500, transactions: 1 },
    ])
  })

  it('uses the same realised events for the headline and monthly chart', () => {
    const { result } = renderHook(() => useReturnsAnalysis())
    expect(result.current.netProfitLoss).toBe(100)
    expect(result.current.realisedEventCount).toBe(1)
    expect(result.current.monthlyComboData).toEqual([
      { month: 'Aug 26', income: 100, expenses: 0, net: 100, cumulative: 100 },
    ])
  })

  it('waits for configured accounts and offers retry if those preferences fail', () => {
    const refetch = vi.fn()
    mocks.preferences.mockReturnValue({ ...ready, data: undefined, isLoading: true, refetch })
    const { result, rerender } = renderHook(() => useReturnsAnalysis())
    expect(result.current.isLoading).toBe(true)
    mocks.preferences.mockReturnValue({ ...ready, data: undefined, isError: true, refetch })
    rerender()
    expect(result.current.isError).toBe(true)
    result.current.retry()
    expect(refetch).toHaveBeenCalledOnce()
  })
})
