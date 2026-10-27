/**
 * The three made-up checks behind demo `/api/balance-checks`
 * (`demoBalanceChecks.ts`). Demo mode cannot write, so these stand in for the
 * user's own: one on the newest row of a busy account (matched), one at the
 * end of last month on the next (rows came after it: changed), and one
 * INR 1,250 off on the third (mismatch).
 */

import { addDaysToKey, inclusiveDaySpan } from '@/lib/dateUtils'
import type { BalanceCheckResult } from '@/services/api/balanceChecks'
import type { Transaction } from '@/types'

import { generateDemoAccountBalances } from './generateDerivedData'

export const IDLE_DAYS = 30
export const TOLERANCE = 1
const DEMO_GAP = 1250

export function daysSince(fromKey: string, toKey: string): number {
  return fromKey >= toKey ? 0 : inclusiveDaySpan(fromKey, toKey) - 1
}

/** The as-of balance the demo Accounts page shows for that day. */
function ledgerAt(txs: Transaction[], account: string, day: string): number {
  return generateDemoAccountBalances(txs, { end_date: day }).accounts[account]?.balance ?? 0
}

function makeCheck(id: number, day: string, ledger: number, gap: number): BalanceCheckResult {
  const balance = Math.round((ledger + gap) * 100) / 100
  const difference = Math.round((balance - ledger) * 100) / 100
  return {
    id,
    check_date: day,
    balance,
    ledger_balance: ledger,
    difference,
    matches: Math.abs(difference) <= TOLERANCE,
  }
}

/** Accounts with a row on or before today within `IDLE_DAYS`, busiest first. */
function activeAccounts(rows: Map<string, Map<string, number>>, today: string) {
  return [...rows.entries()]
    .map(([account, days]) => ({
      account,
      days: [...days.keys()].filter((day) => day <= today).sort((a, b) => a.localeCompare(b)),
    }))
    .filter(({ days }) => days.length > 0 && daysSince(days.at(-1) ?? today, today) <= IDLE_DAYS)
    .sort((a, b) => b.days.length - a.days.length)
}

/**
 * The made-up checks, keyed by account, on the busiest accounts that are
 * active and hold money (a check of a zero balance shows nothing).
 */
export function demoChecks(
  txs: Transaction[],
  rows: Map<string, Map<string, number>>,
  today: string,
): Map<string, BalanceCheckResult> {
  const lastMonthEnd = addDaysToKey(`${today.slice(0, 7)}-01`, -1)
  const busiest = activeAccounts(rows, today)
  const checks = new Map<string, BalanceCheckResult>()
  const settled = busiest.find(({ account, days }) => ledgerAt(txs, account, days.at(-1) ?? today) !== 0)
  if (settled) {
    const day = settled.days.at(-1) ?? today
    checks.set(settled.account, makeCheck(1, day, ledgerAt(txs, settled.account, day), 0))
  }
  busiest
    .filter(
      ({ account, days }) =>
        account !== settled?.account &&
        (days.at(0) ?? today) <= lastMonthEnd &&
        ledgerAt(txs, account, lastMonthEnd) !== 0,
    )
    .slice(0, 2)
    .forEach(({ account }, index) => {
      const ledger = ledgerAt(txs, account, lastMonthEnd)
      checks.set(account, makeCheck(index + 2, lastMonthEnd, ledger, index === 0 ? 0 : DEMO_GAP))
    })
  return checks
}
