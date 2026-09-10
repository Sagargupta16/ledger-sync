/**
 * Guards which categories reach the stacked asset series on the Net Worth page.
 *
 * `allCategories` used to filter against an inline literal array,
 * `['Credit Cards', 'Loans', 'Loans/Lended', 'Other']`. The `'Loans'` entry
 * excluded nothing: `resolveAccountCategory` cannot return it, because no
 * `AccountType` member serializes to it (`AccountType.LOANS` is
 * `'Loans/Lended'`). Removing it is behaviour-preserving -- what these tests pin
 * is the behaviour the list is FOR, so dropping a real entry (or adding an
 * unreachable one) is caught.
 */

import type { ReactNode } from 'react'

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Transaction } from '@/types'

import { useNetWorth } from '../useNetWorth'

/**
 * One account per wire account type, so every category
 * `resolveAccountCategory` can produce shows up in `categoryTotals`. Balances
 * are nonzero (the hook keys categories off balances) and deliberately signed to
 * match the account kind.
 */
const balances = {
  accounts: {
    'Wallet A': { balance: 5_000, transactions: 1 },
    'Bank A': { balance: 200_000, transactions: 4 },
    'Demat A': { balance: 300_000, transactions: 2 },
    'Card A': { balance: -20_000, transactions: 1 },
    'Friend A': { balance: 8_000, transactions: 1 },
    'Zzz 9911': { balance: 1_000, transactions: 1 },
  },
}

const classifications = {
  'Wallet A': 'Other Wallets',
  'Bank A': 'Bank Accounts',
  'Demat A': 'Investments',
  'Card A': 'Credit Cards',
  'Friend A': 'Loans/Lended',
  // No row for 'Zzz 9911': the API serves 'Other', and the name matches no
  // heuristic, so it lands in the 'Other' bucket.
}

const TRANSACTIONS: Transaction[] = [
  {
    id: 't-1',
    date: '2026-06-30',
    amount: 100_000,
    type: 'Income',
    category: 'Employment Income',
    account: 'Bank A',
  } as unknown as Transaction,
]

const balancesRef: {
  current: { accounts: Record<string, { balance: number; transactions: number }> }
} = { current: balances }
const transactionsRef = { current: TRANSACTIONS }

vi.mock('@/hooks/api/useAnalytics', () => ({
  useAccountBalances: () => ({
    data: balancesRef.current,
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
    data: classifications,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

function wrapper({ children }: { children: ReactNode }) {
  return <>{children}</>
}

describe('useNetWorth -- stacked asset categories', () => {
  beforeEach(() => {
    balancesRef.current = balances
    transactionsRef.current = TRANSACTIONS
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 6, 26))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps only the asset categories', () => {
    const { result } = renderHook(() => useNetWorth(), { wrapper })
    expect([...result.current.allCategories].sort()).toEqual([
      'Bank Accounts',
      'Cash & Wallets',
      'Investments',
    ])
  })

  it('excludes liabilities and the unclassified bucket from the stack', () => {
    const { result } = renderHook(() => useNetWorth(), { wrapper })
    // Each of these has a real nonzero balance above, so it IS in categoryTotals
    // and would appear in the stack if the exclusion list missed it.
    expect(result.current.allCategories).not.toContain('Credit Cards')
    expect(result.current.allCategories).not.toContain('Loans/Lended')
    expect(result.current.allCategories).not.toContain('Other')
  })

  it('never emits a bare Loans category, which is not a wire value', () => {
    const { result } = renderHook(() => useNetWorth(), { wrapper })
    expect(result.current.allCategories).not.toContain('Loans')
  })

  it('allocates the full positive cash-flow balance across only included assets', () => {
    const { result } = renderHook(() => useNetWorth(), { wrapper })
    const point = result.current.filteredNetWorthData[0]
    const stackedTotal = result.current.allCategories.reduce(
      (sum, category) => sum + Number(point[category]),
      0,
    )
    // Positive excluded Loans/Lended and Other balances do not dilute this stack.
    expect(stackedTotal).toBeCloseTo(100_000)
    expect(point['Bank Accounts']).toBeCloseTo(100_000 * 200_000 / 505_000)
    expect(result.current.totalAssets).toBe(514_000)
    expect(result.current.totalLiabilities).toBe(20_000)
  })

  it('keeps a bank overdraft out of positive category values', () => {
    balancesRef.current = {
      accounts: {
        'Bank A': { balance: 100_000, transactions: 1 },
        'Overdraft Bank': { balance: -40_000, transactions: 1 },
      },
    }
    transactionsRef.current = [
      ...TRANSACTIONS,
      { ...TRANSACTIONS[0], id: 't-2', type: 'Expense', amount: 40_000 },
    ]
    const { result } = renderHook(() => useNetWorth(), { wrapper })
    expect(result.current.totalAssets).toBe(100_000)
    expect(result.current.totalLiabilities).toBe(40_000)
    expect(result.current.netWorth).toBe(60_000)
    expect(result.current.allCategories).toEqual(['Bank Accounts'])
    expect(result.current.filteredNetWorthData[0]).toMatchObject({
      netWorth: 60_000,
      'Bank Accounts': 60_000,
    })
  })
})
