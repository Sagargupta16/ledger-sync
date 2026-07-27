/**
 * Pins the demo `/api/calculations/account-balances` payload to the shape the
 * real endpoint serves.
 *
 * `_compute_account_statistics` in `backend/src/ledger_sync/api/calculations_helpers.py`
 * returns the five summary numbers NESTED under `statistics`. The frontend
 * response type declared them FLAT, and the demo builder was written against
 * that flat type, so demo mode answered a shape production never sends. Nothing
 * read the numbers yet, which is the only reason it stayed invisible -- the first
 * consumer would have read `undefined` against the live API and a number in demo.
 *
 * The backend also counts a ZERO balance as neither positive nor negative
 * (`> 0` / `< 0`), so the two counts need not sum to `total_accounts`. The demo
 * builder used `>= 0` and `total - positive`, which put every zero-balance
 * account in the positive bucket. Demo mode seeds three wallet accounts that can
 * land on exactly 0, so this was reachable, not theoretical.
 */

import { describe, expect, it } from 'vitest'

import { generateDemoAccountBalances } from '@/lib/demo/demoCalculations'
import type { AccountBalances } from '@/services/api/calculations'
import type { Transaction } from '@/types'

/**
 * Exact key set of the backend `statistics` object, in declaration order.
 *
 * Typed as `keyof AccountBalances['statistics']` so this is also a COMPILE-time
 * guard: flattening the response type again -- or renaming a summary field --
 * fails `tsc` here rather than waiting for a runtime read of `undefined`.
 */
const STATISTICS_KEYS: readonly (keyof AccountBalances['statistics'])[] = [
  'total_accounts',
  'total_balance',
  'average_balance',
  'positive_accounts',
  'negative_accounts',
]

function tx(overrides: Partial<Transaction> & Pick<Transaction, 'date' | 'amount'>): Transaction {
  return {
    id: `demo-${overrides.date}-${overrides.amount}`,
    type: 'Expense',
    category: 'Food & Dining',
    account: 'SBI Savings',
    ...overrides,
  }
}

describe('generateDemoAccountBalances shape contract', () => {
  it('nests the five summary numbers under statistics, not flat on the root', () => {
    const payload = generateDemoAccountBalances([tx({ date: '2026-03-04', amount: 500 })])

    expect(Object.keys(payload).toSorted()).toEqual(['accounts', 'statistics'])
    expect(Object.keys(payload.statistics).toSorted()).toEqual([...STATISTICS_KEYS].toSorted())
  })

  it('leaves no summary number stranded at the root, where a reader finds undefined', () => {
    const payload = generateDemoAccountBalances([tx({ date: '2026-03-04', amount: 500 })])
    const root = payload as unknown as Record<string, unknown>

    for (const key of STATISTICS_KEYS) {
      expect(root[key]).toBeUndefined()
    }
  })

  it('populates every summary number with a finite value', () => {
    const { statistics } = generateDemoAccountBalances([tx({ date: '2026-03-04', amount: 500 })])

    for (const key of STATISTICS_KEYS) {
      expect(Number.isFinite(statistics[key])).toBe(true)
    }
  })

  it('counts a zero balance as neither positive nor negative, matching the backend', () => {
    // 'Amazon Wallet' opens at 500 and is in the non-negative clamp set, so
    // spending exactly its opening balance lands it on 0.
    const { accounts, statistics } = generateDemoAccountBalances([
      tx({ date: '2026-03-04', amount: 500, account: 'Amazon Wallet' }),
    ])

    expect(accounts['Amazon Wallet'].balance).toBe(0)
    // The old `>= 0` counted this account as positive and derived
    // negative = total - positive, so the two buckets always summed to the total.
    expect(statistics.positive_accounts + statistics.negative_accounts).toBeLessThan(
      statistics.total_accounts,
    )
  })

  it('keeps total_accounts equal to the account map size', () => {
    const { accounts, statistics } = generateDemoAccountBalances([
      tx({ date: '2026-03-04', amount: 500, account: 'Brand New Account' }),
    ])

    expect(statistics.total_accounts).toBe(Object.keys(accounts).length)
  })
})
