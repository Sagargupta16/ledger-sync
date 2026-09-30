import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { computeCFPScore } from '@/lib/financialHealthCalculator'
import type { AccountBalances } from '@/services/api/calculations'
import type { Transaction } from '@/types'

import FinancialHealthScore from '../FinancialHealthScore'

const fixture = vi.hoisted((): {
  accounts: AccountBalances['accounts']
  preferences: {
    earning_start_date?: string
    use_earning_start_date?: boolean
    capital_loss_categories?: string[]
    investment_account_mappings?: Record<string, string>
  }
} => ({
  accounts: {},
  preferences: {},
}))

vi.mock('@/hooks/api/useTransactions', () => ({
  useTransactions: () => ({ data: [], isLoading: false, isError: false }),
}))

vi.mock('@/hooks/api/usePreferences', () => ({
  usePreferences: () => ({ data: fixture.preferences, isLoading: false, isError: false }),
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
  fixture.preferences = {}
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2025-04-10T12:00:00Z'))
  vi.clearAllMocks()
})

afterEach(() => vi.useRealTimers())

describe('FinancialHealthScore CFP input parity', () => {
  it('bounds current cashflow by saved employment start even with chart cropping disabled', () => {
    fixture.preferences = { earning_start_date: '2025-02-01', use_earning_start_date: false }
    vi.setSystemTime(new Date('2025-05-10T12:00:00Z'))
    const history = syntheticLedger().concat([
      { id: 'college', date: '2019-01-01', type: 'Income', category: 'Gift', amount: 5000, account: 'Synthetic Bank' },
      { id: 'april-rent', date: '2025-04-01', type: 'Expense', category: 'Rent', amount: 20000, account: 'Synthetic Bank' },
    ])
    render(<FinancialHealthScore transactions={history} />)
    const inputs = vi.mocked(computeCFPScore).mock.calls[0][0]
    expect(inputs.totalIncome).toBe(200000)
    expect(inputs.avgMonthlyIncome).toBeCloseTo(200000 / 3)
    expect(screen.getByText(/Feb 2025.*Apr 2025.*3 completed months/)).toBeInTheDocument()
    expect(screen.getByText(/Lifetime balances/)).toBeInTheDocument()
  })

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

  it('keeps a classified realised loss out of expenses, and counts it until classified', () => {
    const loss: Transaction = {
      id: 'loss', date: '2025-02-20', type: 'Expense', category: 'Investment Expenses',
      subcategory: 'F&O Loss', amount: 30000, account: 'Synthetic Bank',
    }

    render(<FinancialHealthScore transactions={[...syntheticLedger(), loss]} />)
    expect(vi.mocked(computeCFPScore).mock.calls[0][0].totalExpenses).toBe(150000)

    vi.clearAllMocks()
    fixture.preferences = { capital_loss_categories: ['investment expenses::f&o loss'] }
    render(<FinancialHealthScore transactions={[...syntheticLedger(), loss]} />)
    expect(vi.mocked(computeCFPScore).mock.calls[0][0].totalExpenses).toBe(120000)
  })

  it('reads mapped investment accounts case-insensitively from preferences', () => {
    const sip: Transaction = {
      id: 'sip', date: '2025-02-10', type: 'Transfer', category: 'Transfer', amount: 10000,
      account: 'Synthetic Bank', from_account: 'Synthetic Bank', to_account: 'My Future',
    }
    fixture.preferences = { investment_account_mappings: { 'my future': 'Mutual Funds' } }

    render(<FinancialHealthScore transactions={[...syntheticLedger(), sip]} />)
    expect(vi.mocked(computeCFPScore).mock.calls[0][0].netInvestments).toBe(10000)
  })
})
