/**
 * Calendar expansion: which days of a given month a recurring bill falls on.
 *
 * Split out of `billUtils.ts` when the exhaustive frequency dispatch pushed that
 * file past the 250-line extract threshold. Frequency strings are resolved
 * through `@/lib/recurrenceFrequency` -- the app's single frequency table -- so
 * this file never re-types a cadence of its own.
 */

import type { RecurringTransaction } from '@/hooks/api/useAnalyticsV2'
import { MS_PER_DAY, parseLocalDate } from '@/lib/dateUtils'
import { normalizeFrequency } from '@/lib/recurrenceFrequency'

const MONTHS_IN_YEAR = 12

/** Get the number of days in a given month (0-indexed month) */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** Clamp a day to the valid range for a given month */
export function clampDay(d: number, daysInMonth: number): number {
  return Math.min(Math.max(d, 1), daysInMonth)
}

/**
 * Collect recurring days within a month by walking from a reference date
 * at a given interval (in days).
 */
export function getRecurringDaysInMonth(
  nextExpected: string,
  year: number,
  month: number,
  daysInMonth: number,
  intervalDays: number,
): number[] {
  const nextDate = parseLocalDate(nextExpected)
  const days: number[] = []
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month, daysInMonth)
  const intervalMs = intervalDays * MS_PER_DAY

  let current = new Date(nextDate)
  while (current > monthStart) {
    current = new Date(current.getTime() - intervalMs)
  }
  while (current <= monthEnd) {
    if (current >= monthStart && current <= monthEnd) {
      days.push(current.getDate())
    }
    current = new Date(current.getTime() + intervalMs)
  }
  return days
}

/**
 * Every day in the month. A daily bill is owed every single day, so there is no
 * anchor date to walk from -- the whole month is the answer.
 *
 * Before this existed, `daily` fell through the frequency chain to the
 * `expected_day` fallback and rendered ONCE per month, which is both a missing
 * bill on 30 of 31 days and a monthly total ~30x too low.
 */
export function getDailyDays(daysInMonth: number): number[] {
  return Array.from({ length: daysInMonth }, (_, index) => index + 1)
}

export function getWeeklyDays(tx: RecurringTransaction, year: number, month: number, daysInMonth: number): number[] {
  if (!tx.next_expected) return []
  return getRecurringDaysInMonth(tx.next_expected, year, month, daysInMonth, 7)
}

export function getFortnightlyDays(tx: RecurringTransaction, year: number, month: number, daysInMonth: number): number[] {
  if (!tx.next_expected) return []
  return getRecurringDaysInMonth(tx.next_expected, year, month, daysInMonth, 14)
}

export function getMonthlyDays(tx: RecurringTransaction, daysInMonth: number): number[] {
  if (tx.expected_day == null) return []
  return [clampDay(tx.expected_day, daysInMonth)]
}

/**
 * Days for a bill due every `strideMonths` months on `expected_day`, phased off
 * `next_expected` when it is known and off month 0 when it is not.
 */
export function getEveryNthMonthDays(
  tx: RecurringTransaction,
  month: number,
  daysInMonth: number,
  strideMonths: number,
): number[] {
  if (tx.expected_day == null) return []
  if (!tx.next_expected) {
    if (month % strideMonths === 0) return [clampDay(tx.expected_day, daysInMonth)]
    return []
  }
  const nextDate = parseLocalDate(tx.next_expected)
  const nextMonth = nextDate.getMonth()
  const diff = (((month - nextMonth) % MONTHS_IN_YEAR) + MONTHS_IN_YEAR) % MONTHS_IN_YEAR
  if (diff % strideMonths === 0) return [clampDay(tx.expected_day, daysInMonth)]
  return []
}

export function getQuarterlyDays(tx: RecurringTransaction, month: number, daysInMonth: number): number[] {
  return getEveryNthMonthDays(tx, month, daysInMonth, 3)
}

export function getYearlyDays(tx: RecurringTransaction, month: number, daysInMonth: number): number[] {
  if (tx.expected_day == null || !tx.next_expected) return []
  const nextDate = parseLocalDate(tx.next_expected)
  if (nextDate.getMonth() === month) {
    return [clampDay(tx.expected_day, daysInMonth)]
  }
  return []
}

/**
 * Compile-time guard: reachable only if a `RecurrenceFrequency` has no branch in
 * the dispatch below, which is a type error rather than a silent fallback.
 */
function assertAllFrequenciesHandled(frequency: never): never {
  throw new Error(`Unhandled recurrence frequency: ${String(frequency)}`)
}

/**
 * Determine which days in a given month a recurring transaction falls on.
 * Returns an array of day numbers (1-based).
 *
 * Unresolvable frequencies are handled BEFORE the switch, so the switch itself
 * is exhaustive over `RecurrenceFrequency` and its `never` guard fails
 * type-check if a frequency loses its branch or a new one is added. Previously a
 * `default` arm absorbed both cases silently, which is what turned a daily bill
 * into a monthly one. `tx.frequency` is NOT pre-lowercased -- `normalizeFrequency`
 * owns casing.
 */
export function getBillDaysForMonth(
  tx: RecurringTransaction,
  year: number,
  month: number,
): number[] {
  const daysInMonth = getDaysInMonth(year, month)
  const frequency = normalizeFrequency(tx.frequency)

  if (!frequency) {
    // Unrecognized or absent frequency: best effort from `expected_day`.
    if (tx.expected_day != null) return [clampDay(tx.expected_day, daysInMonth)]
    return []
  }

  switch (frequency) {
    case 'daily':
      return getDailyDays(daysInMonth)
    case 'weekly':
      return getWeeklyDays(tx, year, month, daysInMonth)
    case 'biweekly':
      return getFortnightlyDays(tx, year, month, daysInMonth)
    case 'monthly':
      return getMonthlyDays(tx, daysInMonth)
    case 'bimonthly':
      return getEveryNthMonthDays(tx, month, daysInMonth, 2)
    case 'quarterly':
      return getQuarterlyDays(tx, month, daysInMonth)
    case 'semiannual':
      return getEveryNthMonthDays(tx, month, daysInMonth, 6)
    case 'yearly':
      return getYearlyDays(tx, month, daysInMonth)
    default:
      return assertAllFrequenciesHandled(frequency)
  }
}
