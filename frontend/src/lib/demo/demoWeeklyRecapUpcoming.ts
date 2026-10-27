/**
 * Demo twin of the recap's coming-up half (backend `core/weekly_recap_upcoming.py`):
 * recurring expense commitments due from today to seven days ahead, and days
 * to payday.
 *
 * Bills start from the demo answer the Bill Calendar reads
 * (`resolveDemoRecurring`), so the amount is the effective one, a user's edit
 * included. A due date already past rolls forward by cadence while the last
 * payment is inside its review window (two intervals plus seven days); past
 * that a commitment has stopped rather than lagged.
 */

import { addDaysToKey, addMonthsToMonthKey, daysInMonth, getDateKey, MS_PER_DAY, parseLocalDate } from '@/lib/dateUtils'
import { recurrenceCadence } from '@/lib/recurrenceFrequency'
import { getRecurringFreshness, isAcceptedRecurringCommitment } from '@/lib/recurringCalculations'
import type { RecurringTransaction } from '@/services/api/analyticsV2'
import type { BillDue, RecapBills, RecapPayday } from '@/services/api/weeklyRecap'
import type { Transaction } from '@/types'

import { generateDemoPreferences } from './demoPreferences'
import { resolveDemoRecurring } from './demoRecurring'

/** Days after today the bills window runs to, as the backend and the notification bell. */
const DUE_HORIZON_DAYS = 7

/** Half away from zero like the backend's `ROUND_HALF_UP`, and never a negative zero. */
export function roundHalfUp(value: number, scale: number): number {
  const rounded = Math.round(Math.abs(value) * scale) / scale
  return value < 0 && rounded !== 0 ? -rounded : rounded
}

/** Whole days from `fromKey` to `toKey`, negative when `toKey` is earlier. */
export const dayDiff = (fromKey: string, toKey: string): number =>
  Math.round((parseLocalDate(toKey).getTime() - parseLocalDate(fromKey).getTime()) / MS_PER_DAY)

/** `day` in the month of `monthKey`, clamped to its length (the backend's `_clamped`). */
function dayInMonth(monthKey: string, day: number): string {
  const clamped = Math.min(Math.max(day, 1), daysInMonth(monthKey))
  return `${monthKey.slice(0, 7)}-${String(clamped).padStart(2, '0')}`
}

/** `_roll_forward`: `due`, or its first later occurrence on or after today. */
function rollForward(row: RecurringTransaction, due: string, todayKey: string): string | null {
  if (due >= todayKey) return due
  const cadence = recurrenceCadence(row.frequency)
  // Once a due date has passed, the review window applies to a confirmed row too.
  const recent = getRecurringFreshness({ ...row, is_confirmed: false }, todayKey) === 'recent'
  if (!cadence || !row.last_occurrence || !recent) return null
  if (cadence.unit === 'day') {
    return addDaysToKey(due, Math.ceil(dayDiff(due, todayKey) / cadence.stride) * cadence.stride)
  }
  // Step from the last payment so the 31st does not drift after a short month.
  const last = getDateKey(row.last_occurrence)
  const day = row.expected_day ?? Number(last.slice(8, 10))
  let rolled = due
  for (let steps = 2; rolled < todayKey; steps += 1) {
    rolled = dayInMonth(addMonthsToMonthKey(last, cadence.stride * steps), day)
  }
  return rolled
}

function billFor(row: RecurringTransaction, todayKey: string, windowEnd: string): BillDue | null {
  if (row.type !== 'Expense' || !row.next_expected || !isAcceptedRecurringCommitment(row, todayKey)) return null
  const due = rollForward(row, getDateKey(row.next_expected), todayKey)
  if (!due || due > windowEnd) return null
  const cadence = recurrenceCadence(row.frequency)
  const occurrences = cadence?.unit === 'day' ? 1 + Math.floor(dayDiff(due, windowEnd) / cadence.stride) : 1
  const amount = Math.abs(row.expected_amount)
  return {
    id: row.id, name: row.name, category: row.category, frequency: row.frequency ?? 'monthly',
    due_date: due, days_until: dayDiff(todayKey, due), amount: roundHalfUp(amount, 100),
    occurrences, total: roundHalfUp(amount * occurrences, 100), is_confirmed: row.is_confirmed,
  }
}

export function demoBillsDue(txs: Transaction[], todayKey: string): RecapBills {
  const windowEnd = addDaysToKey(todayKey, DUE_HORIZON_DAYS)
  const items = resolveDemoRecurring(txs, { active_only: true }).data
    .flatMap((row) => billFor(row, todayKey, windowEnd) ?? [])
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || b.total - a.total || a.name.localeCompare(b.name))
  const total = roundHalfUp(items.reduce((sum, item) => sum + item.total, 0), 100)
  return { window_start: todayKey, window_end: windowEnd, total, items }
}

/** Today when it is payday, else the next one; short months clamp the day. */
export function demoNextPayday(todayKey: string): RecapPayday {
  const day = Math.min(Math.max(generateDemoPreferences().payday, 1), 31)
  const thisMonth = dayInMonth(todayKey, day)
  const next = thisMonth >= todayKey ? thisMonth : dayInMonth(addMonthsToMonthKey(todayKey, 1), day)
  return { day_of_month: day, next_date: next, days_until: dayDiff(todayKey, next) }
}
