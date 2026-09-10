import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useInvestmentAnalytics } from '../useInvestmentAnalytics'

vi.mock('@/hooks/api/useAnalytics', () => ({
  useAccountBalances: () => ({ data: { accounts: {} }, isLoading: false, isError: false }),
}))
vi.mock('@/hooks/api/usePreferences', () => ({
  usePreferences: () => ({
    data: {
      investment_account_mappings: { 'Fund A': 'mutual_funds', 'Fund B': 'stocks' },
      monthly_investment_target: 10000,
    },
    isLoading: false, isError: false,
  }),
}))
vi.mock('@/hooks/api/useTransactions', () => ({
  useTransactions: () => ({
    data: [
      { date: '2026-08-01', type: 'Transfer', amount: 10000, from_account: 'Bank', to_account: 'Fund A', category: 'Transfer' },
      { date: '2026-08-02', type: 'Transfer', amount: 10000, from_account: 'Fund A', to_account: 'Fund B', category: 'Transfer' },
      { date: '2026-08-03', type: 'Transfer', amount: 4000, from_account: 'Fund B', to_account: 'Bank', category: 'Transfer' },
      { date: '2026-08-04', type: 'Income', amount: 100, category: 'Investment Income', subcategory: 'Interest', note: 'Realized FD interest', account: 'Bank' },
    ],
    isLoading: false, isError: false,
  }),
}))
vi.mock('@/hooks/useAnalyticsTimeFilter', () => ({
  useAnalyticsTimeFilter: () => ({
    dateRange: { start_date: null, end_date: null }, timeFilterProps: {},
  }),
}))

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 31))
})
afterEach(() => vi.useRealTimers())

it('reconciles monthly progress, account balances and recorded P&L', () => {
  const { result } = renderHook(() => useInvestmentAnalytics())
  expect(result.current.currentMonthInvestment).toBe(6000)
  expect(result.current.targetProgress).toBe(60)
  expect(result.current.totalInvestmentValue).toBe(6000)
  expect(result.current.filteredGrowthData.at(-1)?.Stocks).toBe(6000)
  expect(result.current.filteredGrowthData.at(-1)?.['Mutual Funds']).toBe(0)
  expect(result.current.netInvestmentPL).toBe(100)
})
