import { toLocalDateKey } from '@/lib/dateUtils'

import type { DayCell } from './components/DayOfWeekChart'

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export interface DayOfWeekPoint {
  readonly day: string
  readonly spending: number
  readonly earning: number
  readonly dayIndex: number
}

export interface DayOfWeekInsights {
  readonly topDay: string
  readonly topAmount: number
  readonly bottomDay: string | undefined
  readonly weekendDelta: number
}

/**
 * Average spend and earn per weekday, over the days that have actually happened.
 *
 * The divisor is the reason this is a function rather than a loop inside the
 * chart. The year grid spans the WHOLE calendar or fiscal year, so for the
 * current year its tail is future-dated: on 2026-07-27 the CY2026 grid holds 52
 * Mondays but only 30 have occurred. Dividing by 52 made every "Avg Spending"
 * bar read 1.73x too low, which is a chart that understates the user's own
 * spending habit.
 *
 * Elapsed days with zero spend still count -- a Monday you spent nothing on is a
 * real zero and belongs in the average. A Monday that has not arrived is not.
 *
 * `today` is injectable so the boundary is testable without freezing the clock.
 */
export function computeDayOfWeekAverages(
  grid: readonly DayCell[],
  today: string = toLocalDateKey(new Date()),
): { data: DayOfWeekPoint[]; insights: DayOfWeekInsights | null } {
  const totals = DAYS.map(() => ({ expense: 0, income: 0, count: 0 }))

  for (const cell of grid) {
    if (cell.date > today) continue
    const bucket = totals[cell.dayOfWeek]
    if (!bucket) continue
    bucket.expense += cell.expense
    bucket.income += cell.income
    bucket.count += 1
  }

  const data = DAYS.map((day, index) => {
    const { expense, income, count } = totals[index]
    return {
      day,
      spending: count > 0 ? expense / count : 0,
      earning: count > 0 ? income / count : 0,
      dayIndex: index,
    }
  })

  const sortedBySpend = [...data].sort((a, b) => b.spending - a.spending)
  const top = sortedBySpend[0]
  if (!top || top.spending <= 0) return { data, insights: null }

  // Sat + Sun vs Mon-Fri, each averaged over its own day count so a 2-day
  // weekend is not compared against a 5-day sum.
  const weekendSpend = (data[0].spending + data[6].spending) / 2
  const weekdaySpend = data.slice(1, 6).reduce((sum, d) => sum + d.spending, 0) / 5

  return {
    data,
    insights: {
      topDay: top.day,
      topAmount: top.spending,
      bottomDay: sortedBySpend.at(-1)?.day,
      weekendDelta: weekdaySpend > 0 ? (weekendSpend - weekdaySpend) / weekdaySpend : 0,
    },
  }
}
