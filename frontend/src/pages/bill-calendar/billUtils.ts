import type { RecurringTransaction } from '@/hooks/api/useAnalyticsV2'
import { rawColors } from '@/constants/colors'
import { getTodayKey } from '@/lib/dateUtils'
import { formatDate } from '@/lib/formatters'
import { isAcceptedRecurringCommitment } from '@/lib/recurringCalculations'
import { getBillDaysForMonth, getDaysInMonth } from './billDays'
import type { PlacedBill } from './types'

// Calendar expansion (which days a bill falls on) lives in `./billDays`.
// Re-exported here so existing importers keep working.
export * from './billDays'

/** Get the day of the week the 1st of the month falls on (0=Sun, 6=Sat) */
export function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

/** Format month name + year */
export function formatMonthYear(year: number, month: number): string {
  return formatDate(new Date(year, month, 1), { month: 'long', year: 'numeric' })
}

/** Format a short date */
export function formatShortDate(year: number, month: number, day: number): string {
  return formatDate(new Date(year, month, day), { month: 'short', day: 'numeric' })
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

export function buildBillMap(
  transactions: RecurringTransaction[],
  year: number,
  month: number,
  asOfDateKey: string = getTodayKey(),
): Map<number, PlacedBill[]> {
  const map = new Map<number, PlacedBill[]>()

  const addBill = (day: number, bill: PlacedBill) => {
    const existing = map.get(day) ?? []
    existing.push(bill)
    map.set(day, existing)
  }

  for (const tx of transactions) {
    if (tx.type !== 'Expense' || !isAcceptedRecurringCommitment(tx, asOfDateKey)) continue
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
  if (bill.source === 'card') {
    if (bill.cardStatus === 'paid') return rawColors.app.green
    return bill.cardStatus === 'overdue' ? rawColors.app.red : rawColors.app.purple
  }
  if (bill.source === 'confirmed') return rawColors.app.green
  if (bill.source === 'tax') return rawColors.app.orange
  // The legend names this colour "Detected"; a category hue would reuse the status greens, purples and oranges.
  return rawColors.app.blue
}

/** Find the first bill still to pay from a given start day through end of month */
function findFirstBillFromDay(
  billMap: Map<number, PlacedBill[]>,
  startDay: number,
  daysInMonth: number,
): PlacedBill | null {
  for (let d = startDay; d <= daysInMonth; d++) {
    const next = billMap.get(d)?.find((bill) => !bill.informational)
    if (next) return next
  }
  return null
}

/** How far past the viewed month the next-bill search reads (quarterly and yearly bills). */
const NEXT_BILL_LOOKAHEAD_MONTHS = 12

export interface UpcomingBill {
  bill: PlacedBill
  year: number
  /** 0-indexed, like `Date`. */
  month: number
}

/**
 * Find the next upcoming bill relative to today. The viewed month is searched
 * first; when it holds none, `billMapForMonth` is read for the months after it.
 */
export function findNextUpcomingBill(
  billMap: Map<number, PlacedBill[]>,
  viewYear: number,
  viewMonth: number,
  now: Date,
  billMapForMonth?: (year: number, month: number) => Map<number, PlacedBill[]>,
): UpcomingBill | null {
  const todayDate = now.getDate()
  const todayMonth = now.getMonth()
  const todayYear = now.getFullYear()
  const daysInMonth = getDaysInMonth(viewYear, viewMonth)

  const isCurrentMonth = viewYear === todayYear && viewMonth === todayMonth
  const isFutureMonth = viewYear > todayYear || (viewYear === todayYear && viewMonth > todayMonth)
  if (!isCurrentMonth && !isFutureMonth) return null

  const inViewedMonth = findFirstBillFromDay(billMap, isCurrentMonth ? todayDate : 1, daysInMonth)
  if (inViewedMonth) return { bill: inViewedMonth, year: viewYear, month: viewMonth }
  if (!billMapForMonth) return null

  for (let ahead = 1; ahead <= NEXT_BILL_LOOKAHEAD_MONTHS; ahead++) {
    const monthIndex = viewMonth + ahead
    const year = viewYear + Math.floor(monthIndex / 12)
    const month = monthIndex % 12
    const bill = findFirstBillFromDay(billMapForMonth(year, month), 1, getDaysInMonth(year, month))
    if (bill) return { bill, year, month }
  }
  return null
}
