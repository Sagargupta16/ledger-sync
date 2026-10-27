/**
 * Text for the weekly recap: the labels the card shows and the facts the
 * Explain button sends. Both use the same formatters, so the AI narrative
 * quotes exactly the figures on screen, in the user's display currency.
 *
 * The facts are totals, dates, and category and commitment names. A flag goes
 * as its type, severity and day only: its description can quote an account, a
 * note and an amount in the detection-time currency, so it stays on the card.
 */

import { formatMonthKey } from '@/lib/dateUtils'
import { formatCurrency, formatDate, formatPercent, getOrdinalSuffix } from '@/lib/formatters'
import { anomalyTypeLabel } from '@/pages/anomaly-review/constants'
import type { BillDue, CategoryMover, RecapAnomaly, RecapNetWorth, RecapSpending, WeeklyRecap } from '@/services/api/weeklyRecap'

/** At most this many movers, bills or flags go into the facts. */
const MAX_FACT_ITEMS = 5

/** "Mon, Oct 19" for a `YYYY-MM-DD` ledger day. */
export const recapDay = (key: string): string =>
  formatDate(key, { weekday: 'short', month: 'short', day: 'numeric' })

/** "+₹1,200.00" or "-₹1,200.00", unsigned at zero. */
export function signedMoney(value: number): string {
  const text = formatCurrency(Math.abs(value))
  if (Math.abs(value) < 0.005) return text
  return `${value > 0 ? '+' : '-'}${text}`
}

/** "+12.5%" against the average, or "new" with no baseline spending. */
const changeText = (pct: number | null): string => (pct === null ? 'new' : formatPercent(pct, true))

export function daysText(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

export const ordinalDay = (day: number): string => `${day}${getOrdinalSuffix(day)}`

/** "1 bill", "3 bills". */
export const countLabel = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`

function billLabel(bill: BillDue): string {
  const amount = formatCurrency(bill.amount)
  const day = recapDay(bill.due_date)
  return bill.occurrences > 1
    ? `${bill.name} ${amount} x${bill.occurrences} from ${day}`
    : `${bill.name} ${amount} on ${day}`
}

/** "high expense, high severity, on Tue, Oct 21": structured fields, never the description. */
function flagFact(flag: RecapAnomaly): string {
  const kind = `${anomalyTypeLabel(flag.type).replaceAll('_', ' ').toLowerCase()}, ${flag.severity} severity`
  if (flag.occurred_on) return `${kind}, on ${recapDay(flag.occurred_on)}`
  return flag.period ? `${kind}, for ${formatMonthKey(flag.period)}` : kind
}

function weeksText(weeks: number): string {
  return weeks === 1 ? 'the week before' : `the ${weeks} weeks before`
}

function spendingFact(spending: RecapSpending, weeks: number): string {
  const spent = formatCurrency(spending.this_week)
  if (spending.weekly_average === null) return `Spending: ${spent}, with no earlier full week to compare.`
  return `Spending: ${spent} against a weekly average of ${formatCurrency(spending.weekly_average)} over ${weeksText(weeks)} (${changeText(spending.change_pct)}).`
}

function moverFact(mover: CategoryMover): string {
  return `${mover.category} ${formatCurrency(mover.this_week)} (${signedMoney(mover.change)} vs its average, ${changeText(mover.change_pct)})`
}

function netWorthFact(netWorth: RecapNetWorth): string {
  const base = `Net worth at book value: ${signedMoney(netWorth.change)} for the week, ending at ${formatCurrency(netWorth.end)}.`
  const { driver } = netWorth
  if (!driver) return base
  const kind = driver.type === 'Income' ? 'income' : 'spending'
  return `${base} Biggest driver: ${driver.category} ${kind}, ${signedMoney(driver.amount)}.`
}

/**
 * The recap as plain fact lines: totals, dates, and category and commitment
 * names. Never a ledger row, a note, an account or an anomaly description.
 */
export function buildRecapFacts(recap: WeeklyRecap): string {
  const { week, bills, payday } = recap
  const lines = [`Recap week: ${recapDay(week.start)} to ${recapDay(week.end)} (India time).`]
  if (!week.is_complete && week.data_through) {
    lines.push(`Data note: the latest transaction is on ${recapDay(week.data_through)}, so this week may be incomplete.`)
  }
  lines.push(spendingFact(recap.spending, week.baseline_weeks))
  if (recap.movers.length > 0) {
    lines.push(`Biggest category moves: ${recap.movers.slice(0, MAX_FACT_ITEMS).map(moverFact).join('; ')}.`)
  }
  lines.push(netWorthFact(recap.net_worth))
  const dueSpan = `from ${recapDay(bills.window_start)} to ${recapDay(bills.window_end)}`
  lines.push(
    bills.items.length === 0
      ? `No recurring bills are due ${dueSpan}.`
      : `Recurring bills due ${dueSpan}: ${formatCurrency(bills.total)} across ${countLabel(bills.items.length, 'commitment')}: ${bills.items.slice(0, MAX_FACT_ITEMS).map(billLabel).join('; ')}.`,
  )
  if (recap.anomaly_count > 0) {
    const flags = recap.anomalies.slice(0, MAX_FACT_ITEMS).map(flagFact)
    lines.push(`Flagged for review (${recap.anomaly_count}): ${flags.join('; ')}.`)
  }
  lines.push(`Next payday: ${recapDay(payday.next_date)}, ${daysText(payday.days_until)}.`)
  return lines.join('\n')
}
