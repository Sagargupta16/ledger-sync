import { addDaysToKey, getTodayKey } from '@/lib/dateKeys'
import type { BankAlert, BankAlertList, BankAlertStatus } from '@/services/api/bankAlerts'
import { BANK_ALERT_DAYS } from '@/services/api/bankAlerts'
import type { Transaction } from '@/types'

/**
 * Mirrors `GET /api/bank-alerts` (`get_bank_alerts` in backend
 * `api/bank_alerts.py`).
 *
 * Built off the demo ledger: its newest expenses become alerts that match
 * real demo rows, three spends that no demo row holds are missing, and one
 * alert is ignored. The demo's one import happened "now" (as its Data Health
 * says), so every alert predates it. Demo mode blocks the PATCH, so the panel
 * turns its buttons off there.
 */

const MATCHED_COUNT = 5
const WINDOW_DAYS = 2
const DAY_MS = 86_400_000

const BANKS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bhdfc/i, 'HDFC Bank'],
  [/\bicici/i, 'ICICI Bank'],
  [/\baxis/i, 'Axis Bank'],
  [/\bsbi/i, 'State Bank of India'],
]

interface SyntheticAlert {
  readonly daysAgo: number
  readonly amount: number
  readonly merchant: string
  readonly bank: string
  readonly tail: string
}

const MISSING: readonly SyntheticAlert[] = [
  { daysAgo: 1, amount: 349.37, merchant: 'Corner Bakery', bank: 'HDFC Bank', tail: '4821' },
  { daysAgo: 3, amount: 1260.11, merchant: 'metro.recharge@upi', bank: 'State Bank of India', tail: '7302' },
  { daysAgo: 6, amount: 89.53, merchant: 'City Pharmacy', bank: 'HDFC Bank', tail: '4821' },
]
const IGNORED: readonly SyntheticAlert[] = [
  { daysAgo: 9, amount: 40, merchant: 'Parking kiosk', bank: 'ICICI Bank', tail: '1190' },
]

/** A stable, made-up last four for a demo account name. */
function demoTail(account: string): string {
  let hash = 7
  for (const char of account) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 10_000
  return String(hash).padStart(4, '0')
}

function bankFor(account: string): string | null {
  return BANKS.find(([pattern]) => pattern.test(account))?.[1] ?? null
}

/** 10:00 IST on the alert's day. */
function receivedAt(day: string): string {
  return `${day}T04:30:00.000Z`
}

/** Nudge an amount until no demo expense within the window shares it, so it reads as missing. */
function unmatchedAmount(expenses: readonly Transaction[], day: string, amount: number): number {
  const near = new Set(
    expenses
      .filter((t) => Math.abs(Date.parse(t.date.slice(0, 10)) - Date.parse(day)) <= WINDOW_DAYS * DAY_MS)
      .map((t) => t.amount.toFixed(2)),
  )
  let value = amount
  while (near.has(value.toFixed(2))) value = Math.round((value + 0.11) * 100) / 100
  return value
}

function syntheticAlerts(
  specs: readonly SyntheticAlert[],
  status: BankAlertStatus,
  firstId: number,
  today: string,
  expenses: readonly Transaction[],
): BankAlert[] {
  return specs.map((spec, index) => {
    const day = addDaysToKey(today, -spec.daysAgo)
    return {
      id: firstId + index,
      direction: 'debit',
      amount: unmatchedAmount(expenses, day, spec.amount),
      account_tail: spec.tail,
      merchant: spec.merchant,
      bank: spec.bank,
      occurred_on: day,
      received_at: receivedAt(day),
      status,
      after_last_import: false,
      matched_transaction_id: null,
    }
  })
}

export function generateDemoBankAlerts(
  txs: Transaction[],
  params: Record<string, unknown>,
  _url: string,
  now: Date = new Date(),
): BankAlertList {
  const requested = Number(params.days)
  const days = Number.isInteger(requested) && requested >= 1 && requested <= 366 ? requested : BANK_ALERT_DAYS
  const today = getTodayKey(now)
  const since = addDaysToKey(today, -days)
  // txs arrive sorted newest-first.
  const expenses = txs.filter((t) => t.type === 'Expense' && t.date.slice(0, 10) >= since)

  const matched: BankAlert[] = expenses.slice(0, MATCHED_COUNT).map((t, index) => ({
    id: index + 1,
    direction: 'debit',
    amount: t.amount,
    account_tail: demoTail(t.account),
    merchant: t.note || t.subcategory || t.category,
    bank: bankFor(t.account),
    occurred_on: t.date.slice(0, 10),
    received_at: receivedAt(t.date.slice(0, 10)),
    status: 'matched',
    after_last_import: false,
    matched_transaction_id: t.id,
  }))

  const alerts = [
    ...matched,
    ...syntheticAlerts(MISSING, 'missing', 100, today, expenses),
    ...syntheticAlerts(IGNORED, 'ignored', 200, today, expenses),
  ]
    .filter((alert) => alert.occurred_on >= since)
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.id - a.id)
  const count = (status: BankAlertStatus) => alerts.filter((alert) => alert.status === status).length

  return {
    alerts,
    counts: { matched: count('matched'), missing: count('missing'), ignored: count('ignored') },
    window_days: WINDOW_DAYS,
    since,
    truncated: false,
    // The same instant the demo Data Health reports for its one synthetic import.
    last_import_at: now.toISOString(),
  }
}
