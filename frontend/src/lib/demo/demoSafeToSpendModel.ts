/**
 * Safe-to-spend arithmetic for demo mode: the rules of the backend's
 * `core/safe_to_spend*.py`, run over the demo ledger, so the card and the
 * projection chart read the shapes and figures the real endpoints would serve.
 *
 * Two demo-only stand-ins: a bill row is recognised by its commitment's
 * category and subcategory (demo notes do not repeat the commitment name the
 * way imported notes do), and the demo's transfer-type commitments are skipped,
 * because detection only produces income and expense patterns; the real
 * endpoint reads those transfers as each account's usual net transfer instead.
 */

import { spendableAccountTest } from '@/lib/ageOfMoneyCalculator'
import { addDaysToKey, daysInMonth, getDateKey, inclusiveDaySpan } from '@/lib/dateUtils'
import { medianOf } from '@/lib/distribution'
import { isAcceptedRecurringCommitment } from '@/lib/recurringCalculations'
import { recurrenceCadence } from '@/lib/recurrenceFrequency'
import type { RecurringTransaction } from '@/services/api/analyticsV2'
import type { BalanceSeries, PlannedFlow } from '@/services/api/safeToSpend'
import type { Transaction } from '@/types'

import { isDemoCapitalLoss } from './demoCalculations'

export type Role = 'spendable' | 'card' | 'other' | 'unclassified'
export type SpendByDay = Map<string, Map<string, number>>

/** Role of each account from its classification, as `AccountPool.role` decides it. */
export function roleTest(classifications: Readonly<Record<string, string>>): (account: string) => Role {
  const spendable = spendableAccountTest(classifications)
  return (account) => {
    const kind = classifications[account]
    if (kind === undefined) return 'unclassified'
    if (kind === 'Credit Cards') return 'card'
    return spendable(account) ? 'spendable' : 'other'
  }
}

const monthIndex = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1
const pad = (value: number) => String(value).padStart(2, '0')

/** Day `day` of month `index` (year * 12 + month - 1), clamped to the month's length. */
function monthDay(index: number, day: number): string {
  const year = Math.floor(index / 12)
  const month = index - year * 12
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return `${year}-${pad(month + 1)}-${pad(Math.min(Math.max(day, 1), last))}`
}

/** `[start, nextPayday]` of the cycle holding `today`. */
export function payCycle(today: string, payday: number): [string, string] {
  const index = monthIndex(today)
  const current = monthDay(index, payday)
  return today >= current ? [current, monthDay(index + 1, payday)] : [monthDay(index - 1, payday), current]
}

export const followingPayday = (key: string, payday: number) => monthDay(monthIndex(key) + 1, payday)

/** The `count` whole `YYYY-MM` months before the month of `day`, oldest first. */
export function monthKeysBefore(day: string, count: number): string[] {
  const index = monthIndex(day)
  return Array.from({ length: count }, (_, i) => monthDay(index - count + i, 1).slice(0, 7))
}

/** Dates after `last_occurrence` on the item's cadence, within `[start, end]`. */
function occurrences(item: RecurringTransaction, start: string, end: string): string[] {
  const cadence = recurrenceCadence(item.frequency)
  const anchor = item.last_occurrence ? getDateKey(item.last_occurrence) : null
  if (!cadence || !anchor) return []
  const day = item.expected_day ?? Number(anchor.slice(8, 10))
  const dates: string[] = []
  for (let k = 1; ; k++) {
    const on = cadence.unit === 'day'
      ? addDaysToKey(anchor, cadence.stride * k)
      : monthDay(monthIndex(anchor) + cadence.stride * k, day)
    if (on > end) return dates
    if (on >= start) dates.push(on)
  }
}

const billKey = (category: string, subcategory: string | null | undefined) => `${category}::${subcategory ?? ''}`

export function commitmentFlows(
  recurring: readonly RecurringTransaction[],
  today: string,
  [start, end]: [string, string],
  role: (account: string) => Role,
): { flows: PlannedFlow[]; billKeys: Set<string> } {
  const flows: PlannedFlow[] = []
  const billKeys = new Set<string>()
  for (const item of recurring) {
    if (!item.is_active || item.pattern_kind !== 'commitment') continue
    if (item.type !== 'Income' && item.type !== 'Expense') continue
    if (item.type === 'Expense') billKeys.add(billKey(item.category, item.subcategory))
    if (role(item.account) === 'other' || !isAcceptedRecurringCommitment(item, today)) continue
    const amount = item.type === 'Income' ? Math.abs(item.expected_amount) : -Math.abs(item.expected_amount)
    for (const date of occurrences(item, start, end)) flows.push({ name: item.name, account: item.account, date, amount })
  }
  flows.sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount)
  return { flows, billKeys }
}

/** Expense per day and account on spendable and card accounts, bills and losses left out. */
export function discretionarySpend(
  txs: readonly Transaction[],
  [start, end]: [string, string],
  billKeys: ReadonlySet<string>,
  role: (account: string) => Role,
): SpendByDay {
  const byDay: SpendByDay = new Map()
  for (const tx of txs) {
    const day = getDateKey(tx.date)
    if (tx.type !== 'Expense' || day < start || day > end || isDemoCapitalLoss(tx)) continue
    const accountRole = role(tx.account)
    if ((accountRole !== 'spendable' && accountRole !== 'card') || billKeys.has(billKey(tx.category, tx.subcategory))) continue
    const accounts = byDay.get(day) ?? new Map<string, number>()
    accounts.set(tx.account, (accounts.get(tx.account) ?? 0) + Math.abs(tx.amount))
    byDay.set(day, accounts)
  }
  return byDay
}

/** Each calendar day's spend over `[first, last]` on the included accounts, zero days kept. */
export function dailyTotals(spend: SpendByDay, [first, last]: [string, string], include: (account: string) => boolean): number[] {
  return Array.from({ length: inclusiveDaySpan(first, last) }, (_, i) => {
    let total = 0
    for (const [account, amount] of spend.get(addDaysToKey(first, i)) ?? []) if (include(account)) total += amount
    return total
  })
}

/** Median over whole months of each spendable account's net transfers per day. */
export function transferRates(txs: readonly Transaction[], monthKeys: readonly string[], role: (account: string) => Role): Map<string, number> {
  const net = new Map<string, Map<string, number>>()
  const add = (account: string | undefined, month: string, amount: number) => {
    if (!account || role(account) !== 'spendable') return
    const months = net.get(account) ?? new Map<string, number>()
    months.set(month, (months.get(month) ?? 0) + amount)
    net.set(account, months)
  }
  for (const tx of txs) {
    const month = tx.date.slice(0, 7)
    if (tx.type !== 'Transfer' || !monthKeys.includes(month)) continue
    add(tx.to_account, month, Math.abs(tx.amount))
    add(tx.from_account ?? tx.account, month, -Math.abs(tx.amount))
  }
  return new Map([...net].map(([account, months]) => [
    account,
    medianOf(monthKeys.map((key) => (months.get(key) ?? 0) / daysInMonth(key))),
  ]))
}

const round = (value: number) => Math.round(value * 100) / 100

function series(name: string, start: number, balances: number[], dates: readonly string[], threshold: number, rates: [number, number]): BalanceSeries {
  const crossing = (level: number) => (start < level ? null : dates.find((_, i) => balances[i] < level) ?? null)
  const low = balances.reduce((best, value, i) => (value < balances[best] ? i : best), 0)
  return {
    name,
    start_balance: round(start),
    balances: balances.map(round),
    lowest: round(balances[low] ?? start),
    lowest_on: dates[low] ?? dates[0],
    below_zero_on: crossing(0),
    below_threshold_on: threshold > 0 ? crossing(threshold) : null,
    starts_below_zero: start < 0,
    daily_spend: round(rates[0]),
    daily_transfer: round(rates[1]),
  }
}

/** End-of-day balances per spendable account; flows dated before today land today. */
export function projectBalances(
  startBalances: Readonly<Record<string, number>>,
  flows: readonly PlannedFlow[],
  options: { spend: ReadonlyMap<string, number>; transfers: ReadonlyMap<string, number>; role: (account: string) => Role; today: string; days: number; threshold: number },
): { dates: string[]; accounts: BalanceSeries[]; total: BalanceSeries; unassigned: number } {
  const { spend, transfers, role, today, days, threshold } = options
  const dates = Array.from({ length: days }, (_, i) => addDaysToKey(today, i))
  const placed = new Map<string, Map<string, number>>()
  const unassigned = new Map<string, number>()
  let unassignedCount = 0
  for (const flow of flows) {
    if (flow.date > dates[dates.length - 1]) continue
    const on = flow.date < today ? today : flow.date
    const accountRole = role(flow.account)
    if (accountRole === 'spendable') {
      const byDay = placed.get(flow.account) ?? new Map<string, number>()
      byDay.set(on, (byDay.get(on) ?? 0) + flow.amount)
      placed.set(flow.account, byDay)
    } else if (accountRole === 'unclassified') {
      unassigned.set(on, (unassigned.get(on) ?? 0) + flow.amount)
      unassignedCount += 1
    }
  }
  const names = [...new Set([
    ...Object.entries(startBalances)
      .filter(([name, balance]) => role(name) === 'spendable' && (balance || spend.get(name) || transfers.get(name)))
      .map(([name]) => name),
    ...placed.keys(),
  ])].sort((a, b) => a.localeCompare(b))
  const accounts = names.map((name) => {
    const rates: [number, number] = [spend.get(name) ?? 0, transfers.get(name) ?? 0]
    let balance = startBalances[name] ?? 0
    const points = dates.map((on) => (balance += (placed.get(name)?.get(on) ?? 0) + rates[1] - rates[0]))
    return series(name, startBalances[name] ?? 0, points, dates, threshold, rates)
  })
  let running = 0
  const totalPoints = dates.map((on, i) => {
    running += unassigned.get(on) ?? 0
    return accounts.reduce((sum, account) => sum + account.balances[i], running)
  })
  const totalRates: [number, number] = [
    accounts.reduce((sum, a) => sum + a.daily_spend, 0),
    accounts.reduce((sum, a) => sum + a.daily_transfer, 0),
  ]
  const totalStart = accounts.reduce((sum, a) => sum + a.start_balance, 0)
  return { dates, accounts, total: series('Total', totalStart, totalPoints, dates, threshold, totalRates), unassigned: unassignedCount }
}
