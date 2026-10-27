/**
 * Demo twin of `GET /api/weekly-recap` (backend `core/weekly_recap.py`).
 *
 * The same rules over the demo ledger: the last full Monday to Sunday IST
 * week, spending against up to four full weeks before it, net worth as income
 * minus every expense row, open anomalies about the week's transactions or its
 * months, and days to payday. Bills (`demoWeeklyRecapUpcoming.ts`) and flags
 * start from the demo answers the Bill Calendar and Anomalies pages read
 * (`resolveDemoRecurring`, `generateDemoAnomalyList`), so the three agree. Only
 * type imports from the services layer: `services/api/client.ts` imports this
 * module.
 */

import { addDaysToKey, getDateKey, getTodayKey, parseLocalDate } from '@/lib/dateUtils'
import { capitalLossConfig, isCapitalLoss } from '@/lib/expenseClassification'
import type { CategoryMover, NetWorthDriver, RecapAnomaly, RecapSpending, RecapWeek, WeeklyRecap } from '@/services/api/weeklyRecap'
import type { Transaction } from '@/types'

import { generateDemoAnomalyList } from './demoAnomalies'
import { DEMO_CAPITAL_LOSS_CATEGORIES } from './demoPreferences'
import { dayDiff, demoBillsDue, demoNextPayday, roundHalfUp } from './demoWeeklyRecapUpcoming'

const WEEK_DAYS = 7
const BASELINE_WEEKS = 4
const TOP_ITEMS = 5
const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

const round2 = (value: number): number => roundHalfUp(value, 100)
const percent = (change: number, base: number): number | null =>
  base > 0 ? roundHalfUp((change / base) * 100, 10) : null
const isZero = (value: number): boolean => Math.abs(value) < 0.005
const total = (values: Iterable<number>): number => [...values].reduce((sum, value) => sum + value, 0)

const add = (map: Map<string, number>, key: string, amount: number) => map.set(key, (map.get(key) ?? 0) + amount)

interface Flows {
  opening: number
  income: number
  expenses: number
  spendWeek: Map<string, number>
  spendBaseline: Map<string, number>
  contributions: Map<string, NetWorthDriver>
}

function weekFlows(txs: Transaction[], start: string, end: string, baselineStart: string): Flows {
  const losses = capitalLossConfig(DEMO_CAPITAL_LOSS_CATEGORIES)
  const flows: Flows = { opening: 0, income: 0, expenses: 0, spendWeek: new Map(), spendBaseline: new Map(), contributions: new Map() }
  for (const tx of txs) {
    const income = tx.type === 'Income'
    if (!income && tx.type !== 'Expense') continue
    const day = getDateKey(tx.date)
    const spending = !income && !isCapitalLoss(tx, losses)
    if (day < start) {
      flows.opening += income ? tx.amount : -tx.amount
      if (spending && day >= baselineStart) add(flows.spendBaseline, tx.category, tx.amount)
      continue
    }
    if (day > end) continue
    const type = income ? 'Income' : 'Expense'
    const key = `${type}::${tx.category}`
    const prior = flows.contributions.get(key)?.amount ?? 0
    flows.contributions.set(key, { category: tx.category, type, amount: prior + (income ? tx.amount : -tx.amount) })
    if (income) flows.income += tx.amount
    else flows.expenses += tx.amount
    if (spending) add(flows.spendWeek, tx.category, tx.amount)
  }
  return flows
}

/** Only categories spent on in the week, as the backend: no 100% falls for monthly bills. */
function topMovers(flows: Flows, weeks: number): CategoryMover[] {
  return [...flows.spendWeek.keys()]
    .filter((category) => !isZero(flows.spendWeek.get(category) ?? 0))
    .sort((a, b) => a.localeCompare(b))
    .map((category) => {
      const thisWeek = flows.spendWeek.get(category) ?? 0
      const average = weeks ? (flows.spendBaseline.get(category) ?? 0) / weeks : 0
      const change = thisWeek - average
      return { category, this_week: round2(thisWeek), weekly_average: round2(average), change: round2(change), change_pct: percent(change, average) }
    })
    .filter((mover) => !isZero(mover.change))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, TOP_ITEMS)
}

function biggestDriver(flows: Flows): NetWorthDriver | null {
  const ranked = [...flows.contributions.values()]
    .filter((item) => !isZero(item.amount))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.type.localeCompare(b.type) || a.category.localeCompare(b.category))
  return ranked[0] ? { ...ranked[0], amount: round2(ranked[0].amount) } : null
}

/**
 * Open flags about a transaction dated in the week, or month-level ones about
 * its months, from the demo Anomalies answer. The flagged row's own date links
 * a flag to the week, as the backend's join does.
 */
function weekAnomalies(txs: Transaction[], start: string, end: string): RecapAnomaly[] {
  const months = new Set([start.slice(0, 7), end.slice(0, 7)])
  const dayOf = new Map(txs.map((tx) => [tx.id, getDateKey(tx.date)]))
  return generateDemoAnomalyList(txs, { limit: 200 }).data
    .flatMap((row): RecapAnomaly[] => {
      const occurredOn = row.transaction_id ? (dayOf.get(row.transaction_id) ?? null) : null
      const inWeek = occurredOn ? occurredOn >= start && occurredOn <= end : !row.transaction_id && months.has(row.period_key ?? '')
      if (!inWeek) return []
      const amount = row.actual_value === null ? null : round2(row.actual_value)
      return [{ id: row.id, type: row.anomaly_type, severity: row.severity, description: row.description, occurred_on: occurredOn, period: row.period_key, amount }]
    })
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || (b.occurred_on ?? '').localeCompare(a.occurred_on ?? '') || a.id - b.id)
}

/** The week, its baseline, and the ledger span; a row dated ahead does not complete it. */
function recapWeek(txs: Transaction[], todayKey: string): RecapWeek {
  const weekday = (parseLocalDate(todayKey).getDay() + 6) % 7 // Monday = 0, as `recap_week_start`
  const start = addDaysToKey(todayKey, -(weekday + WEEK_DAYS))
  const end = addDaysToKey(start, WEEK_DAYS - 1)
  const days = txs.map((tx) => getDateKey(tx.date)).sort((a, b) => a.localeCompare(b))
  const first = days[0] ?? null
  const last = days.findLast((day) => day <= todayKey) ?? null
  const weeks = first ? Math.max(0, Math.min(BASELINE_WEEKS, Math.floor(dayDiff(first, start) / WEEK_DAYS))) : 0
  return {
    start, end, as_of: todayKey,
    baseline_start: weeks ? addDaysToKey(start, -WEEK_DAYS * weeks) : null,
    baseline_weeks: weeks, data_from: first, data_through: last,
    is_complete: last !== null && last >= end,
  }
}

function spendingSummary(flows: Flows, weeks: number): RecapSpending {
  const thisWeek = total(flows.spendWeek.values())
  if (!weeks) return { this_week: round2(thisWeek), weekly_average: null, change: null, change_pct: null }
  const average = total(flows.spendBaseline.values()) / weeks
  const change = thisWeek - average
  return { this_week: round2(thisWeek), weekly_average: round2(average), change: round2(change), change_pct: percent(change, average) }
}

/** The recap as of `todayKey` (an IST `YYYY-MM-DD`). */
export function buildDemoWeeklyRecap(txs: Transaction[], todayKey: string): WeeklyRecap {
  const week = recapWeek(txs, todayKey)
  const flows = weekFlows(txs, week.start, week.end, week.baseline_start ?? week.start)
  const change = flows.income - flows.expenses
  const anomalies = weekAnomalies(txs, week.start, week.end)
  return {
    week,
    spending: spendingSummary(flows, week.baseline_weeks),
    movers: topMovers(flows, week.baseline_weeks),
    net_worth: {
      start: round2(flows.opening), end: round2(flows.opening + change), change: round2(change),
      income: round2(flows.income), expenses: round2(flows.expenses), driver: biggestDriver(flows),
    },
    bills: demoBillsDue(txs, todayKey),
    anomalies: anomalies.slice(0, TOP_ITEMS),
    anomaly_count: anomalies.length,
    payday: demoNextPayday(todayKey),
  }
}

/** Demo route resolver for `/api/weekly-recap`; the params and URL carry nothing. */
export function generateDemoWeeklyRecap(txs: Transaction[]): WeeklyRecap {
  return buildDemoWeeklyRecap(txs, getTodayKey())
}
