import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useComparisonData } from '../useComparisonData'

vi.mock('@/hooks/api/useTransactions', () => ({
  useTransactions: () => ({
    data: [
      { id: 'college', date: '2020-06-01', type: 'Income', category: 'Gift', amount: 5000, account: 'Bank' },
      { id: 'college-expense', date: '2020-07-01', type: 'Expense', category: 'Food', amount: 2000, account: 'Bank' },
      { id: 'next-year', date: '2021-07-01', type: 'Income', category: 'Allowance', amount: 8000, account: 'Bank' },
      { id: 'salary', date: '2024-06-01', type: 'Income', category: 'Salary', amount: 100000, account: 'Bank' },
    ],
    isLoading: false, isError: false,
  }),
}))

vi.mock('@/hooks/api/usePreferences', () => ({
  usePreferences: () => ({
    data: { fiscal_year_start_month: 4, earning_start_date: '2024-02-01', use_earning_start_date: false },
    isLoading: false, isError: false,
  }),
}))

describe('explicit historical comparison selection', () => {
  it('preserves pre-employment income and the entire selected calendar denominator', () => {
    const { result } = renderHook(() => useComparisonData())
    act(() => {
      result.current.setMode('year')
      result.current.setYearA(2020)
      result.current.setYearB(2021)
    })
    expect(result.current.periodA.income).toBe(5000)
    expect(result.current.periodA.expense).toBe(2000)
    expect(result.current.periodA.days).toBe(366)
    expect(result.current.periodB.income).toBe(8000)
    expect(result.current.periodB.days).toBe(365)
    expect(result.current.transactions).toHaveLength(4)
  })
})
