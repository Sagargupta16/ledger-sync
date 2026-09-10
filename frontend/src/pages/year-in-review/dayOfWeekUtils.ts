import { toLocalDateKey } from '@/lib/dateUtils'
import { computeWeekdaySpending } from '@/lib/finance/spendingStatistics'

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

/** Label the shared elapsed-weekday calculations for the chart. */
export function computeDayOfWeekAverages(
  grid: readonly DayCell[],
  today: string = toLocalDateKey(new Date()),
): { data: DayOfWeekPoint[]; insights: DayOfWeekInsights | null } {
  const model = computeWeekdaySpending(grid, today)
  return {
    data: model.data.map((row) => ({ ...row, day: DAYS[row.dayIndex] })),
    insights: model.insights ? {
      topDay: DAYS[model.insights.topDayIndex],
      topAmount: model.insights.topAmount,
      bottomDay: model.insights.bottomDayIndex === undefined ? undefined : DAYS[model.insights.bottomDayIndex],
      weekendDelta: model.insights.weekendDelta,
    } : null,
  }
}
