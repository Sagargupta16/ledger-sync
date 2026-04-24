import type { RecurringTransaction } from '@/hooks/api/useAnalyticsV2'
import { rawColors } from '@/constants/colors'
import { CATEGORY_COLORS, type PlacedBill } from './types'

/** Get the number of days in a given month (0-indexed month) */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** Get the day of the week the 1st of the month falls on (0=Sun, 6=Sat) */
export function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

/** Format month name + year */
export function formatMonthYear(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

/** Format a short date */
export function formatShortDate(year: number, month: number, day: number): string {
  return new Date(year, month, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/** Check if two dates represent the same day */
export function isSameDay(
  y1: number,
  m1: number,
  d1: number,
  y2: number,
  m2: number,
  d2: number,
): boolean {
  return y1 === y2 && m1 === m2 && d1 === d2
}

/** Capitalize first letter */
export function capitalize(str: string | null): string {
  if (!str) return 'Unknown'
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? rawColors.app.blue
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
  const nextDate = new Date(nextExpected)
  const days: number[] = []
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month, daysInMonth)
  const intervalMs = intervalDays * 24 * 60 * 60 * 1000

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

export function getWeeklyDays(tx: RecurringTransaction, year: number, month: number, daysInMonth: number): number[] {
  if (!tx.next_expected) return []
  return getRecurringDaysInMonth(tx.next_expected, year, month, daysInMonth, 7)
}

export function getMonthlyDays(tx: RecurringTransaction, daysInMonth: number): number[] {
  if (tx.expected_day == null) return []
  return [clampDay(tx.expected_day, daysInMonth)]
}

export function getQuarterlyDays(tx: RecurringTransaction, month: number, daysInMonth: number): number[] {
  if (tx.expected_day == null) return []
  if (!tx.next_expected) {
    if (month % 3 === 0) return [clampDay(tx.expected_day, daysInMonth)]
    return []
  }
  const nextDate = new Date(tx.next_expected)
  const nextMonth = nextDate.getMonth()
  const diff = ((month - nextMonth) % 12 + 12) % 12
  if (diff % 3 === 0) return [clampDay(tx.expected_day, daysInMonth)]
  return []
}

export function getYearlyDays(tx: RecurringTransaction, month: number, daysInMonth: number): number[] {
  if (tx.expected_day == null || !tx.next_expected) return []
  const nextDate = new Date(tx.next_expected)
  if (nextDate.getMonth() === month) {
    return [clampDay(tx.expected_day, daysInMonth)]
  }
  return []
}

export function getFortnightlyDays(tx: RecurringTransaction, year: number, month: number, daysInMonth: number): number[] {
  if (!tx.next_expected) return []
  return getRecurringDaysInMonth(tx.next_expected, year, month, daysInMonth, 14)
}

/**
 * Determine which days in a given month a recurring transaction falls on.
 * Returns an array of day numbers (1-based).
 */
export function getBillDaysForMonth(
  tx: RecurringTransaction,
  year: number,
  month: number,
): number[] {
  const frequency = tx.frequency?.toLowerCase() ?? 'monthly'
  const daysInMonth = getDaysInMonth(year, month)

  if (frequency === 'weekly') return getWeeklyDays(tx, year, month, daysInMonth)
  if (frequency === 'monthly') return getMonthlyDays(tx, daysInMonth)
  if (frequency === 'quarterly') return getQuarterlyDays(tx, month, daysInMonth)
  if (frequency === 'yearly' || frequency === 'annually') return getYearlyDays(tx, month, daysInMonth)
  if (frequency === 'fortnightly' || frequency === 'biweekly') return getFortnightlyDays(tx, year, month, daysInMonth)

  if (tx.expected_day != null) return [clampDay(tx.expected_day, daysInMonth)]
  return []
}

export function buildBillMap(
  transactions: RecurringTransaction[],
  year: number,
  month: number,
): Map<number, PlacedBill[]> {
  const map = new Map<number, PlacedBill[]>()

  const addBill = (day: number, bill: PlacedBill) => {
    const existing = map.get(day) ?? []
    existing.push(bill)
    map.set(day, existing)
  }

  for (const tx of transactions) {
    const days = getBillDaysForMonth(tx, year, month)
    for (const day of days) {
      addBill(day, {
        key: `tx-${tx.id}-${day}`,
        name: tx.name,
        amount: Math.abs(tx.expected_amount),
        category: tx.category,
        frequency: tx.frequency,
        type: tx.type,
        day,
        source: tx.is_confirmed ? 'confirmed' : 'detected',
      })
    }
  }

  return map
}

export function getBillDotColor(bill: PlacedBill): string {
  if (bill.source === 'confirmed') return rawColors.app.green
  return getCategoryColor(bill.category)
}

/** Find the first bill from a given start day through end of month */
export function findFirstBillFromDay(
  billMap: Map<number, PlacedBill[]>,
  startDay: number,
  daysInMonth: number,
): PlacedBill | null {
  for (let d = startDay; d <= daysInMonth; d++) {
    const dayBills = billMap.get(d)
    if (dayBills && dayBills.length > 0) {
      return dayBills[0]
    }
  }
  return null
}

/** Find the next upcoming bill in the viewed month relative to today */
export function findNextUpcomingBill(
  billMap: Map<number, PlacedBill[]>,
  viewYear: number,
  viewMonth: number,
  now: Date,
): PlacedBill | null {
  const todayDate = now.getDate()
  const todayMonth = now.getMonth()
  const todayYear = now.getFullYear()
  const daysInMonth = getDaysInMonth(viewYear, viewMonth)

  if (viewYear === todayYear && viewMonth === todayMonth) {
    return findFirstBillFromDay(billMap, todayDate, daysInMonth)
  }

  const isFutureMonth = viewYear > todayYear || (viewYear === todayYear && viewMonth > todayMonth)
  if (isFutureMonth) {
    return findFirstBillFromDay(billMap, 1, daysInMonth)
  }

  return null
}
