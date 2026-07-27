import type { RecurringTransaction } from '@/hooks/api/useAnalyticsV2'
import { rawColors } from '@/constants/colors'
import { getBillDaysForMonth, getDaysInMonth } from './billDays'
import { CATEGORY_COLORS, type PlacedBill } from './types'

// Calendar expansion (which days a bill falls on) lives in `./billDays`.
// Re-exported here so existing importers keep working.
export * from './billDays'

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
