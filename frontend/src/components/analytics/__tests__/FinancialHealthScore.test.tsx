import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { computeCFPScore } from '@/lib/financialHealthCalculator'
import type { AccountBalances } from '@/services/api/calculations'
import type { Transaction } from '@/types'

import FinancialHealthScore from '../FinancialHealthScore'

const fixture = vi.hoisted((): { accounts: AccountBalances['accounts'] } => ({
  accounts: {},
}))

vi.mock('@/hooks/api/useTransactions', () => ({
  useTransactions: () => ({ data: [], isLoading: false, isError: false }),
}))

vi.mock('@/hooks/api/usePreferences', () => ({
  usePreferences: () => ({ data: {}, isLoading: false, isError: false }),
}))

vi.mock('@/hooks/api/useAnalytics', () => ({
  useAccountBalances: () => ({
    data: { accounts: fixture.accounts },
    isLoading: false,
    isError: false,
  }),
}))

vi.mock('@/hooks/api/useAccountClassifications', () => ({
  useAccountClassifications: () => ({
    data: { 'Synthetic Bank': 'Bank Accounts' },
    isLoading: false,
    isError: false,
  }),
}))

vi.mock('@/store/investmentAccountStore', () => ({
  useInvestmentAccountStore: () => () => false,
}))

vi.mock('@/hooks/useCountUp', () => ({
  useCountUp: (value: number) => value,
}))

vi.mock('@/components/analytics/StandardRadarChart', () => ({
  default: () => null,
}))

// Keep the scorer and both consumers real; observe the input contract.
vi.mock('@/lib/financialHealthCalculator', { spy: true })

function syntheticLedger(): Transaction[] {
  return ['2025-01', '2025-02', '2025-03'].flatMap((month) => {
    const base = { date: `${month}-05`, account: 'Synthetic Bank' }
    return [
      { ...base, id: `${month}-income`, type: 'Income' as const, category: 'Salary', amount: 100000 },
      { ...base, id: `${month}-essential`, type: 'Expense' as const, category: 'Rent', amount: 20000 },
      { ...base, id: `${month}-other`, type: 'Expense' as const, category: 'Shopping', amount: 15000 },
      { ...base, id: `${month}-debt`, type: 'Expense' as const, category: 'EMI', amount: 5000 },
    ]
  })
}

beforeEach(() => {
  fixture.accounts = {}
  vi.clearAllMocks()
})

describe('FinancialHealthScore CFP input parity', () => {
  it.each([null, 0, 80000])('passes actual essential expenses to both consumers with %s observed liquid assets', (observed) => {
    if (observed !== null) {
      fixture.accounts = {
        'Synthetic Bank': { balance: observed, transactions: 12, last_transaction: null },
      }
    }

    render(<FinancialHealthScore transactions={syntheticLedger()} />)

    expect(computeCFPScore).toHaveBeenCalledTimes(2)
    const [summary, detail] = vi.mocked(computeCFPScore).mock.calls.map(([inputs]) => inputs)
    expect(summary).toEqual(detail)
    expect(summary).toMatchObject({
      totalIncome: 300000,
      totalExpenses: 120000,
      avgMonthlyIncome: 100000,
      avgMonthlyExpense: 40000,
      avgMonthlyEssentialExpense: 20000,
      totalDebtOutstanding: 15000,
    })
    expect(summary.balances?.liquidAssets ?? null).toBe(observed)
    expect(screen.getByRole('heading', { name: 'FinHealth Score' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'CFP Ratios' })).toBeInTheDocument()
  })

  it('retains pooled cents instead of rebuilding totals from monthly averages', () => {
    const amounts = [12.34, 23.45, 156.24]
    const transactions = syntheticLedger().map((tx, index) => ({
      ...tx,
      amount: tx.type === 'Income' || tx.category === 'EMI' ? amounts[Math.floor(index / 4)] : 1,
    }))

    render(<FinancialHealthScore transactions={transactions} />)

    expect(computeCFPScore).toHaveBeenCalledTimes(2)
    const [summary, detail] = vi.mocked(computeCFPScore).mock.calls.map(([inputs]) => inputs)
    expect(summary).toEqual(detail)
    expect(summary.totalIncome).toBe(192.03)
    expect(summary.totalDebtOutstanding).toBe(192.03)
    expect(summary.totalIncome).not.toBe(summary.avgMonthlyIncome * 3)
    expect(summary.totalDebtOutstanding).not.toBe(summary.avgMonthlyDebt * 3)
  })
})
