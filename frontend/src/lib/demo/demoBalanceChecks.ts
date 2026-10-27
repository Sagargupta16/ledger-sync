/**
 * Demo `/api/balance-checks`: the summary `balance_check_summary` builds in
 * backend `core/balance_checks.py`, computed from the demo ledger.
 *
 * Balances come from `generateDemoAccountBalances` as-of reads (the demo's
 * opening position plus every flow), the reads the demo Accounts page uses,
 * cut at today. Demo mode cannot write, so three checks are made up to show
 * each verdict (`demoBalanceCheckSamples.ts`); every other account reads as
 * never checked or idle.
 *
 * Like the server, the balance, the dot and the rows after a check are read as
 * of today: a row dated later (the demo fills the whole current month) only
 * counts toward rows, dates and months.
 */

import { getTodayKey } from '@/lib/dateUtils'
import type {
  AccountBalanceHealth,
  BalanceCheckResult,
  BalanceChecksSummary,
  BalanceStatus,
} from '@/services/api/balanceChecks'
import type { Transaction } from '@/types'

import { daysSince, demoChecks, IDLE_DAYS, TOLERANCE } from './demoBalanceCheckSamples'
import { generateDemoAccountBalances } from './generateDerivedData'

/** Per account, rows per `YYYY-MM-DD` day; a transfer counts once on each side. */
function rowsByAccount(txs: readonly Transaction[]): Map<string, Map<string, number>> {
  const byAccount = new Map<string, Map<string, number>>()
  const add = (account: string | undefined, day: string) => {
    if (!account) return
    const days = byAccount.get(account) ?? new Map<string, number>()
    days.set(day, (days.get(day) ?? 0) + 1)
    byAccount.set(account, days)
  }
  for (const tx of txs) {
    const day = tx.date.slice(0, 10)
    if (tx.type.startsWith('Transfer')) {
      add(tx.from_account ?? tx.account, day)
      add(tx.to_account, day)
    } else {
      add(tx.account, day)
    }
  }
  return byAccount
}

/** The later of two optional `YYYY-MM-DD` keys. */
function laterDay(a: string | undefined, b: string | undefined): string | undefined {
  if (!a || !b) return a ?? b
  return a >= b ? a : b
}

/** `account_status` in the backend, step for step. */
function statusOf(
  latest: BalanceCheckResult | undefined,
  rowsAfter: number,
  lastActivity: string | undefined,
  today: string,
): BalanceStatus {
  if (latest && !latest.matches) return 'mismatch'
  if (lastActivity && daysSince(lastActivity, today) > IDLE_DAYS) return 'idle'
  if (!latest) return 'unchecked'
  return rowsAfter > 0 ? 'changed' : 'matched'
}

interface RowCounts {
  readonly total: number
  /** Rows dated after the check, up to today. */
  readonly afterCheck: number
  readonly firstDay: string | undefined
  readonly lastDay: string | undefined
  readonly lastDayThroughToday: string | undefined
  readonly months: { month: string; rows: number }[]
}

/** Row totals for one account; every row counts, only those up to today move the dot. */
function countRows(
  days: Map<string, number>,
  check: BalanceCheckResult | undefined,
  today: string,
): RowCounts {
  const sortedDays = [...days.keys()].sort((a, b) => a.localeCompare(b))
  const months = new Map<string, number>()
  let total = 0
  let afterCheck = 0
  for (const day of sortedDays) {
    const count = days.get(day) ?? 0
    total += count
    if (check && day > check.check_date && day <= today) afterCheck += count
    months.set(day.slice(0, 7), (months.get(day.slice(0, 7)) ?? 0) + count)
  }
  return {
    total,
    afterCheck,
    firstDay: sortedDays.at(0),
    lastDay: sortedDays.at(-1),
    lastDayThroughToday: sortedDays.findLast((day) => day <= today),
    months: [...months.entries()].map(([month, rows]) => ({ month, rows })),
  }
}

function accountEntry(
  account: string,
  days: Map<string, number>,
  balance: number,
  check: BalanceCheckResult | undefined,
  today: string,
): AccountBalanceHealth {
  const counts = countRows(days, check, today)
  const lastActivity = laterDay(counts.lastDayThroughToday, check?.check_date)
  return {
    account,
    is_closed: false,
    status: statusOf(check, counts.afterCheck, lastActivity, today),
    ledger_balance: balance,
    transaction_count: counts.total,
    first_date: counts.firstDay ?? null,
    last_date: counts.lastDay ?? null,
    last_activity: lastActivity ?? null,
    rows_after_check: check ? counts.afterCheck : 0,
    checks: check ? [check] : [],
    months: counts.months,
  }
}

export function generateDemoBalanceChecks(txs: Transaction[]): BalanceChecksSummary {
  const today = getTodayKey()
  const rows = rowsByAccount(txs)
  const balances = generateDemoAccountBalances(txs, { end_date: today }).accounts
  const checks = demoChecks(txs, rows, today)
  const names = [...rows.keys()].sort(
    (a, b) => a.toLowerCase().localeCompare(b.toLowerCase()) || a.localeCompare(b),
  )
  return {
    as_of: today,
    idle_days: IDLE_DAYS,
    tolerance: TOLERANCE,
    accounts: names.map((name) =>
      accountEntry(
        name,
        rows.get(name) ?? new Map<string, number>(),
        balances[name]?.balance ?? 0,
        checks.get(name),
        today,
      ),
    ),
  }
}
