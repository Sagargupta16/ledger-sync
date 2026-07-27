import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  computeDailyBurn,
  computeDaysOfBuffering,
  computeLiquidPosition,
  type LiquidPosition,
} from '@/lib/ageOfMoneyCalculator'
import type { AccountBalances } from '@/services/api/calculations'

/**
 * The buffer math reads `new Date()` for the trailing window, so every case
 * here runs on a pinned clock.
 */
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 6, 27))
})

afterEach(() => {
  vi.useRealTimers()
})

function balances(accounts: Record<string, number>): AccountBalances['accounts'] {
  return Object.fromEntries(
    Object.entries(accounts).map(([name, balance]) => [
      name,
      { balance, transactions: 1, last_transaction: null },
    ]),
  )
}

/**
 * 1,000/day of expense across the trailing window, so a pool divides into a
 * days figure that is trivial to read: 100,000 net liquid is 100 days.
 */
function dailySpend(days: number, amount = 1000) {
  return Array.from({ length: days }, (_, i) => ({
    type: 'Expense',
    amount,
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
  }))
}

describe('computeLiquidPosition', () => {
  it('sums positive cash / bank / wallet balances into grossLiquid', () => {
    const pos = computeLiquidPosition(
      balances({ 'Bank SBI': 280000, 'Cash in hand': 8000, 'Wallet GPay': 2000 }),
      { 'Bank SBI': 'Bank Accounts', 'Cash in hand': 'Cash', 'Wallet GPay': 'Other Wallets' },
    )
    expect(pos.grossLiquid).toBe(290000)
    expect(pos.liabilities).toBe(0)
    expect(pos.netLiquid).toBe(290000)
  })

  it('excludes investments, receivables, and unclassified accounts', () => {
    const pos = computeLiquidPosition(
      balances({ 'Bank SBI': 100000, 'PPF': 500000, 'Loan to Ravi': 20000, 'Zerodha': 300000 }),
      { 'Bank SBI': 'Bank Accounts', 'PPF': 'Investments', 'Loan to Ravi': 'Loans/Lended' },
    )
    expect(pos.grossLiquid).toBe(100000)
  })

  it('keeps a parked deposit out of the pool even when filed as a wallet', () => {
    const pos = computeLiquidPosition(
      balances({ 'Bank SBI': 100000, 'Rent Security Deposit': 60000 }),
      { 'Bank SBI': 'Bank Accounts', 'Rent Security Deposit': 'Other Wallets' },
    )
    expect(pos.grossLiquid).toBe(100000)
  })

  it('routes a negative balance to liabilities wherever it sits', () => {
    const pos = computeLiquidPosition(
      balances({ 'Bank SBI': 100000, 'HDFC Card': -40000, 'Overdrawn Wallet': -5000 }),
      {
        'Bank SBI': 'Bank Accounts',
        'HDFC Card': 'Credit Cards',
        'Overdrawn Wallet': 'Other Wallets',
      },
    )
    expect(pos.grossLiquid).toBe(100000)
    expect(pos.liabilities).toBe(45000)
    expect(pos.netLiquid).toBe(55000)
  })
})

describe('computeDaysOfBuffering', () => {
  it('divides net liquid by the mean daily burn', () => {
    const days = computeDaysOfBuffering(
      { grossLiquid: 100000, liabilities: 0, netLiquid: 100000 },
      dailySpend(30),
    )
    // 30 days of history at 1,000/day -- mean burn is 1,000.
    expect(computeDailyBurn(dailySpend(30))?.mean).toBe(1000)
    expect(days).toBe(100)
  })

  it('returns null when the window holds no spending to rate against', () => {
    expect(
      computeDaysOfBuffering({ grossLiquid: 100000, liabilities: 0, netLiquid: 100000 }, []),
    ).toBeNull()
  })

  it('reads 0 days, not a negative figure, when the pool is underwater', () => {
    const pos = computeLiquidPosition(balances({ 'Bank SBI': 10000, 'HDFC Card': -50000 }), {
      'Bank SBI': 'Bank Accounts',
      'HDFC Card': 'Credit Cards',
    })
    expect(pos.netLiquid).toBe(0)
    expect(computeDaysOfBuffering(pos, dailySpend(30))).toBe(0)
  })
})

/**
 * Regression guard for the removed `computeDaysOfBuffering(liquid: number, ...)`
 * overload. That branch built `{ liabilities: 0, netLiquid: total }` from a
 * caller-summed total, so it could neither exclude a parked deposit nor subtract
 * card debt: on the real audit ledger it read 150 days where the split-aware
 * path reads 146.
 *
 * Both exclusions must move the number. If a future change reintroduces a
 * bare-total path -- or hands `computeDaysOfBuffering` a hand-built position with
 * `liabilities: 0`, which is the same bug under a new name -- one of these
 * assertions goes red.
 */
describe('split-aware buffering (bare-total regression guard)', () => {
  const CLASSIFICATIONS = {
    'Bank SBI': 'Bank Accounts',
    'Rent Security Deposit': 'Other Wallets',
    'HDFC Card': 'Credit Cards',
  }
  const ACCOUNTS = balances({
    'Bank SBI': 200000,
    'Rent Security Deposit': 60000,
    'HDFC Card': -40000,
  })
  const TRANSACTIONS = dailySpend(30)

  /** What the deleted overload would have produced: every balance, summed. */
  const bareTotal = Object.values(ACCOUNTS).reduce((sum, a) => sum + a.balance, 0)
  const bareTotalPosition: LiquidPosition = {
    grossLiquid: bareTotal,
    liabilities: 0,
    netLiquid: Math.max(0, bareTotal),
  }

  it('the split-aware pool is smaller than the un-split total', () => {
    const pos = computeLiquidPosition(ACCOUNTS, CLASSIFICATIONS)
    // 200,000 spendable; the 60,000 deposit never enters, the 40,000 card is debt.
    expect(pos.grossLiquid).toBe(200000)
    expect(pos.liabilities).toBe(40000)
    expect(pos.netLiquid).toBe(160000)
    expect(bareTotal).toBe(220000)
  })

  it('reads fewer days than the bare total would', () => {
    const split = computeDaysOfBuffering(computeLiquidPosition(ACCOUNTS, CLASSIFICATIONS), TRANSACTIONS)
    const unsplit = computeDaysOfBuffering(bareTotalPosition, TRANSACTIONS)
    expect(split).toBe(160)
    expect(unsplit).toBe(220)
    expect(split).toBeLessThan(unsplit as number)
  })

  it('the parked deposit alone changes the result', () => {
    const withDeposit = computeDaysOfBuffering(
      computeLiquidPosition(ACCOUNTS, CLASSIFICATIONS),
      TRANSACTIONS,
    )
    // Same classification, same 60,000, only the NAME loses the parked sense --
    // so the balance now counts and the runway grows by 60,000 / 1,000-per-day.
    const spendableName = computeDaysOfBuffering(
      computeLiquidPosition(
        balances({ 'Bank SBI': 200000, 'Emergency Fund Wallet': 60000, 'HDFC Card': -40000 }),
        {
          'Bank SBI': 'Bank Accounts',
          'Emergency Fund Wallet': 'Other Wallets',
          'HDFC Card': 'Credit Cards',
        },
      ),
      TRANSACTIONS,
    )
    expect(spendableName).toBe(220)
    expect(withDeposit).toBe(160)
  })

  it('reclassifying a parked deposit does not rescue it -- the name override wins', () => {
    // The lexical override applies inside EVERY spendable classification, so
    // filing a security deposit under Bank Accounts still keeps it out.
    const pos = computeLiquidPosition(ACCOUNTS, {
      ...CLASSIFICATIONS,
      'Rent Security Deposit': 'Bank Accounts',
    })
    expect(pos.grossLiquid).toBe(200000)
  })

  it('the negative card balance alone changes the result', () => {
    const withCardDebt = computeDaysOfBuffering(
      computeLiquidPosition(ACCOUNTS, CLASSIFICATIONS),
      TRANSACTIONS,
    )
    const cardSettled = computeDaysOfBuffering(
      computeLiquidPosition(
        balances({ 'Bank SBI': 200000, 'Rent Security Deposit': 60000, 'HDFC Card': 0 }),
        CLASSIFICATIONS,
      ),
      TRANSACTIONS,
    )
    expect(cardSettled).toBe(200)
    expect(withCardDebt).toBe(160)
  })
})
