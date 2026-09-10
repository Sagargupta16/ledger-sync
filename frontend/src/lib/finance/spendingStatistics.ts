import { daysInMonth, monthKeysBetween, MS_PER_DAY, toLocalDateKey } from '@/lib/dateUtils'
import { medianOf } from '@/lib/distribution'
import { currentMonthKey } from '@/lib/savingsRate'

export interface SpendingDateRange {
  start_date?: string
  end_date?: string
}

/** Resolve an elapsed period without allowing future records to extend its divisor. */
export function resolveSpanRange(
  dateRange: SpendingDateRange,
  dataSpan: { min_date?: string | null; max_date?: string | null } | undefined,
  today: string,
): SpendingDateRange {
  const end = dateRange.end_date ?? dataSpan?.max_date ?? undefined
  return {
    start_date: dateRange.start_date ?? dataSpan?.min_date ?? undefined,
    end_date: end && end.slice(0, 10) > today ? today : end,
  }
}

function inclusiveDaySpan(startMs: number, endMs: number): number {
  return Math.max(Math.ceil((endMs - startMs) / MS_PER_DAY) + 1, 1)
}

export function computeDaysInRange(
  dateRange: SpendingDateRange,
  transactions: readonly { date: string }[],
): number {
  if (!dateRange.start_date || !dateRange.end_date) {
    if (transactions.length > 0) {
      const dates = transactions.map((tx) => new Date(tx.date).getTime())
      return inclusiveDaySpan(Math.min(...dates), Math.max(...dates))
    }
    return 30
  }
  return inclusiveDaySpan(
    new Date(dateRange.start_date).getTime(),
    new Date(dateRange.end_date).getTime(),
  )
}

/** Partial months use the covered fraction of their actual calendar length. */
export function monthsCovered(startKey: string, endKey: string): number {
  const start = startKey.slice(0, 10)
  const end = endKey.slice(0, 10)
  if (end < start) return monthsCovered(end, start)
  let months = 0
  for (const monthKey of monthKeysBetween(start, end)) {
    const total = daysInMonth(monthKey)
    const firstDay = monthKey === start.slice(0, 7) ? Number(start.slice(8, 10)) : 1
    const lastDay = monthKey === end.slice(0, 7) ? Number(end.slice(8, 10)) : total
    months += (lastDay - firstDay + 1) / total
  }
  return Math.max(months, 1 / 31)
}

export function computeMonthsInRange(
  dateRange: SpendingDateRange,
  transactions: readonly { date: string }[],
): number {
  if (!dateRange.start_date || !dateRange.end_date) {
    if (transactions.length > 0) {
      const keys = transactions.map((tx) => tx.date.slice(0, 10))
      return monthsCovered(
        keys.reduce((min, key) => (key < min ? key : min), keys[0]),
        keys.reduce((max, key) => (key > max ? key : max), keys[0]),
      )
    }
    return 1
  }
  return monthsCovered(dateRange.start_date, dateRange.end_date)
}

/** Daily and monthly burn rates share the exact same elapsed window. */
export function computeSpendingPace(
  totalSpending: number,
  dateRange: SpendingDateRange,
  dataSpan: { min_date?: string | null; max_date?: string | null } | undefined,
  today: string,
) {
  const spanRange = resolveSpanRange(dateRange, dataSpan, today)
  const daysInRange = computeDaysInRange(spanRange, [])
  const monthsInRange = computeMonthsInRange(spanRange, [])
  return {
    spanRange, daysInRange, monthsInRange,
    avgDailySpending: totalSpending / daysInRange,
    monthlyBurnRate: totalSpending / monthsInRange,
  }
}

/** Typical active spending day; suppress the estimate when coverage is incomplete. */
export function medianSpendingDay(
  rows: readonly { date: string; expense: number }[] | undefined,
  range: SpendingDateRange,
): number | null {
  if (!rows?.length) return null
  const earliestCovered = rows.reduce((min, row) => (row.date < min ? row.date : min), rows[0].date)
  if (range.start_date && range.start_date < earliestCovered) return null
  const inRange = rows.filter(
    (row) => (!range.start_date || row.date >= range.start_date)
      && (!range.end_date || row.date <= range.end_date),
  )
  const spendingDays = inRange.map((row) => Math.abs(row.expense)).filter((value) => value > 0)
  return spendingDays.length > 0 ? medianOf(spendingDays) : null
}

/** Typical completed calendar month, including zero months between observations. */
export function medianSpendingMonth(
  monthly: Record<string, { expense?: number }> | undefined,
  now: Date = new Date(),
): number | null {
  if (!monthly) return null
  const complete = Object.entries(monthly).filter(([key]) => key < currentMonthKey(now))
  if (complete.length === 0) return null
  const byMonth = new Map(complete.map(([key, month]) => [key, Math.abs(month.expense ?? 0)]))
  const keys = [...byMonth.keys()].sort((a, b) => a.localeCompare(b))
  const totals = monthKeysBetween(keys[0], keys.at(-1)!).map((key) => byMonth.get(key) ?? 0)
  return totals.length >= 2 ? medianOf(totals) : null
}

interface WeekdayObservation {
  date: string
  dayOfWeek: number
  expense: number
  income: number
}

/** Elapsed weekday averages count zero-spend days and exclude future grid cells. */
export function computeWeekdaySpending(
  grid: readonly WeekdayObservation[],
  today: string = toLocalDateKey(new Date()),
) {
  const totals = Array.from({ length: 7 }, () => ({ expense: 0, income: 0, count: 0 }))
  for (const cell of grid) {
    if (cell.date > today) continue
    const bucket = totals[cell.dayOfWeek]
    if (!bucket) continue
    bucket.expense += cell.expense
    bucket.income += cell.income
    bucket.count += 1
  }
  const data = totals.map(({ expense, income, count }, dayIndex) => ({
    spending: count > 0 ? expense / count : 0,
    earning: count > 0 ? income / count : 0,
    dayIndex,
  }))
  const sortedBySpend = [...data].sort((a, b) => b.spending - a.spending)
  const top = sortedBySpend[0]
  if (!top || top.spending <= 0) return { data, insights: null }
  const weekendSpend = (data[0].spending + data[6].spending) / 2
  const weekdaySpend = data.slice(1, 6).reduce((sum, day) => sum + day.spending, 0) / 5
  return {
    data,
    insights: {
      topDayIndex: top.dayIndex,
      topAmount: top.spending,
      bottomDayIndex: sortedBySpend.at(-1)?.dayIndex,
      weekendDelta: weekdaySpend > 0 ? (weekendSpend - weekdaySpend) / weekdaySpend : 0,
    },
  }
}
