/**
 * Demo answers for `/api/safe-to-spend` and `/api/safe-to-spend/projection`,
 * built from the demo ledger with the endpoints' own rules
 * (`demoSafeToSpendModel`). One resolver serves both paths, so the route
 * table needs a single `/api/safe-to-spend` entry.
 */

import { computeLiquidPosition } from '@/lib/ageOfMoneyCalculator'
import { addDaysToKey, getDateKey, getTodayKey, inclusiveDaySpan } from '@/lib/dateUtils'
import { medianOf } from '@/lib/distribution'
import type { BalanceProjection, BalanceSeries, PlannedFlow, SafeToSpend, SpendPace } from '@/services/api/safeToSpend'
import type { Transaction } from '@/types'

import { generateDemoAccountClassifications } from './demoAccountReads'
import { generateDemoRecurring } from './demoAnalyticsV2'
import { generateDemoAccountBalances } from './demoCalculations'
import { generateDemoPreferences } from './demoPreferences'
import {
  commitmentFlows, dailyTotals, discretionarySpend, followingPayday, monthKeysBefore, payCycle, projectBalances,
  roleTest, transferRates, type Role, type SpendByDay,
} from './demoSafeToSpendModel'

const LOOKBACK_DAYS = 90
const RESERVE_CYCLES = 3
const TRANSFER_MONTHS = 3
const WARNING_DAYS = 30
const round = (value: number) => Math.round(value * 100) / 100
const sumOf = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)
const earlier = (a: string, b: string) => (a < b ? a : b)
const later = (a: string, b: string) => (a > b ? a : b)

function demoContext(txs: readonly Transaction[], days: number, threshold: number) {
  const today = getTodayKey()
  const payday = generateDemoPreferences().payday || 1
  const cycle = payCycle(today, payday)
  const classifications = generateDemoAccountClassifications()
  const role = roleTest(classifications)
  const accounts = generateDemoAccountBalances([...txs], { end_date: today }).accounts
  const balances = Object.fromEntries(Object.entries(accounts).map(([name, entry]) => [name, entry.balance]))
  const asOf = txs.reduce((latest, tx) => {
    const day = getDateKey(tx.date)
    return day <= today && day > latest ? day : latest
  }, '')
  // Bills count from the day after the newest row (or today), within this cycle.
  const start = later(asOf ? earlier(addDaysToKey(asOf, 1), today) : today, cycle[0])
  let reserveEnd = cycle[1]
  for (let i = 0; i < RESERVE_CYCLES; i++) reserveEnd = followingPayday(reserveEnd, payday)
  const horizon = later(addDaysToKey(today, days - 1), addDaysToKey(reserveEnd, -1))
  const { flows, billKeys } = commitmentFlows(generateDemoRecurring(), today, [start, horizon], role)
  const spend: SpendByDay = asOf
    ? discretionarySpend(txs, [addDaysToKey(asOf, 1 - LOOKBACK_DAYS), asOf], billKeys, role)
    : new Map<string, Map<string, number>>()
  const first = [...spend.keys()].reduce<string | null>((low, day) => (low === null ? day : earlier(low, day)), null)
  const window: [string, string] | null = first && asOf ? [first, asOf] : null
  const monthKeys = asOf ? monthKeysBefore(asOf, TRANSFER_MONTHS) : []
  const isSpendable = (account: string) => role(account) === 'spendable'
  // The average day, big days included, as `spendable_burn` does: a balance falls by everything spent.
  const daily = window ? dailyTotals(spend, window, isSpendable) : []
  const burn = daily.length > 0 ? sumOf(daily) / daily.length : 0
  const shares = new Map<string, number>()
  for (const day of spend.values()) {
    for (const [account, amount] of day) if (isSpendable(account)) shares.set(account, (shares.get(account) ?? 0) + amount)
  }
  // Only accounts holding money take a share, as `spendable_burn` does: an empty wallet cannot fund spending.
  const funded = [...shares].filter(([account]) => (balances[account] ?? 0) > 0)
  const weights = funded.length > 0
    ? funded
    : Object.entries(balances).filter(([name, balance]) => balance > 0 && isSpendable(name))
  const weightTotal = sumOf(weights.map(([, weight]) => weight))
  const perAccount = new Map(weights.map(([account, weight]) => [account, weightTotal ? (burn * weight) / weightTotal : 0]))
  const projection = projectBalances(balances, flows, {
    spend: perAccount, transfers: transferRates(txs, monthKeys, role), role, today, days, threshold,
  })
  return { today, payday, cycle, accounts, classifications, role, flows, spend, window, asOf, monthKeys, burn, projection }
}

type DemoContext = ReturnType<typeof demoContext>

function reserveFor(ctx: DemoContext): SafeToSpend['reserve'] {
  const cycles: SafeToSpend['reserve']['cycles'] = []
  let running = 0
  let reserve = 0
  let start = ctx.cycle[1]
  for (let i = 0; i < RESERVE_CYCLES; i++) {
    const end = followingPayday(start, ctx.payday)
    const inside = ctx.flows.filter((flow) => flow.date >= start && flow.date < end).map((flow) => flow.amount)
    const income = sumOf(inside.filter((amount) => amount > 0))
    const bills = -sumOf(inside.filter((amount) => amount < 0))
    running += income - bills
    reserve = Math.max(reserve, -running)
    cycles.push({ start, end: addDaysToKey(end, -1), income: round(income), bills: round(bills) })
    start = end
  }
  if (!cycles.some((cycle) => cycle.income > 0)) return { amount: 0, status: 'no_recurring_income', cycles }
  return { amount: round(reserve), status: reserve > 0 ? 'reserved' : 'covered', cycles }
}

function paceFor(ctx: DemoContext, safe: number): SpendPace | null {
  const [start, next] = ctx.cycle
  if (!ctx.asOf || ctx.asOf < start) return null
  const cash = (account: string) => ['spendable', 'card'].includes(ctx.role(account))
  const spent = sumOf(dailyTotals(ctx.spend, [start, ctx.asOf], cash))
  const total = inclusiveDaySpan(start, next) - 1
  const elapsed = inclusiveDaySpan(start, ctx.asOf)
  const budget = spent + Math.max(safe, 0)
  const usual = ctx.window ? (sumOf(dailyTotals(ctx.spend, ctx.window, cash)) / inclusiveDaySpan(...ctx.window)) * elapsed : null
  return {
    spent: round(spent), expected: round((budget * elapsed) / total), budget: round(budget),
    usual: usual === null ? null : round(usual), elapsed_days: elapsed, total_days: total, as_of: ctx.asOf,
  }
}

function detectedPayday(flows: readonly PlannedFlow[]): number | null {
  const byName = new Map<string, { total: number; days: number[] }>()
  for (const flow of flows) {
    if (flow.amount <= 0) continue
    const entry = byName.get(flow.name) ?? { total: 0, days: [] }
    entry.total += flow.amount
    entry.days.push(Number(flow.date.slice(8, 10)))
    byName.set(flow.name, entry)
  }
  const top = [...byName.values()].sort((a, b) => b.total - a.total)[0]
  return top && top.days.length >= 2 ? Math.max(...top.days) : null
}

const parseThreshold = (value: unknown) => Math.max(0, Number(value) || 0)

/** Earliest crossing in `group`, a fall below zero first on the same day (`Projection.first_breach`). */
function firstBreach(group: readonly BalanceSeries[]) {
  const hits = group.flatMap((series) => [
    { series, date: series.below_zero_on, kind: 'below_zero' as const },
    { series, date: series.below_threshold_on, kind: 'below_threshold' as const },
  ]).filter((hit): hit is typeof hit & { date: string } => hit.date !== null)
  return hits.reduce<(typeof hits)[number] | null>(
    (best, hit) => (best === null || hit.date < best.date || (hit.date === best.date && hit.kind === 'below_zero') ? hit : best),
    null,
  )
}

export function generateDemoSafeToSpend(txs: readonly Transaction[], params: Record<string, unknown>): SafeToSpend {
  const threshold = parseThreshold(params.threshold)
  const ctx = demoContext(txs, WARNING_DAYS, threshold)
  const [start, next] = ctx.cycle
  const liquid = computeLiquidPosition(ctx.accounts, ctx.classifications)
  const net = liquid.grossLiquid - liquid.liabilities
  const counted = (wanted: Role) => Object.entries(ctx.accounts).filter(([name, a]) => a.balance && ctx.role(name) === wanted).length
  const bills = ctx.flows.filter((flow) => flow.amount < 0 && flow.date < next)
  const billsTotal = -sumOf(bills.map((flow) => flow.amount))
  const reserve = reserveFor(ctx)
  const safe = net - billsTotal - reserve.amount
  const daysLeft = inclusiveDaySpan(ctx.today, next) - 1
  const cash = (account: string) => ['spendable', 'card'].includes(ctx.role(account))
  const breach = firstBreach(ctx.projection.accounts) ?? firstBreach([ctx.projection.total])
  return {
    as_of: ctx.today,
    balance_as_of: ctx.asOf || null,
    threshold,
    cycle: {
      start, next_payday: next, days_left: daysLeft, total_days: inclusiveDaySpan(start, next) - 1,
      payday: ctx.payday, basis: ctx.payday === 1 ? 'month_end' : 'payday', detected_payday: detectedPayday(ctx.flows),
    },
    liquid: {
      gross: round(liquid.grossLiquid), liabilities: round(liquid.liabilities), net: round(net),
      spendable_accounts: counted('spendable'), card_accounts: counted('card'), unclassified_accounts: counted('unclassified'),
    },
    bills_before_payday: round(billsTotal),
    bill_count: bills.length,
    bills: bills.slice(0, 12).map((flow) => ({ ...flow, amount: round(flow.amount) })),
    reserve,
    safe_to_spend: round(safe),
    per_day: round(Math.max(safe, 0) / daysLeft),
    typical_daily_spend: ctx.window ? round(medianOf(dailyTotals(ctx.spend, ctx.window, cash))) : 0,
    pace: paceFor(ctx, safe),
    low_balance: breach
      ? { account: breach.series.name, date: breach.date, balance: breach.series.balances[inclusiveDaySpan(ctx.today, breach.date) - 1], kind: breach.kind }
      : null,
  }
}

export function generateDemoBalanceProjection(txs: readonly Transaction[], params: Record<string, unknown>): BalanceProjection {
  const days = Math.min(90, Math.max(7, Math.round(Number(params.days) || 30)))
  const threshold = parseThreshold(params.threshold)
  const ctx = demoContext(txs, days, threshold)
  const { projection } = ctx
  const last = projection.dates[projection.dates.length - 1]
  const flagged = (series: BalanceSeries) =>
    [series.below_zero_on, series.below_threshold_on].reduce<string>((low, on) => (on && on < low ? on : low), '9999-12-31')
  return {
    as_of: ctx.today,
    balance_as_of: ctx.asOf || null,
    days,
    threshold,
    dates: projection.dates,
    total: projection.total,
    accounts: [...projection.accounts].sort((a, b) => flagged(a).localeCompare(flagged(b)) || b.start_balance - a.start_balance),
    events: ctx.flows
      .filter((flow) => flow.date <= last && ['spendable', 'unclassified'].includes(ctx.role(flow.account)))
      .slice(0, 40)
      .map((flow) => ({ ...flow, date: flow.date < ctx.today ? ctx.today : flow.date, amount: round(flow.amount) })),
    assumptions: { lookback_days: LOOKBACK_DAYS, daily_spend: round(ctx.burn), transfer_months: ctx.monthKeys, unassigned_flows: projection.unassigned },
  }
}

/** DEMO_ROUTES resolver for every `/api/safe-to-spend` path. */
export function resolveDemoSafeToSpend(
  txs: Transaction[],
  params: Record<string, unknown>,
  url: string,
): SafeToSpend | BalanceProjection {
  return url.includes('/safe-to-spend/projection')
    ? generateDemoBalanceProjection(txs, params)
    : generateDemoSafeToSpend(txs, params)
}
