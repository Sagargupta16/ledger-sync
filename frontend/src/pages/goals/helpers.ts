import type { FinancialGoal } from '@/hooks/api/useAnalyticsV2'
import { computeGoalProjection as computeProjection } from '@/lib/finance/goalProjection'
import { rawColors } from '@/constants/colors'
import type { GoalProjection } from './types'

export { addMonths, differenceInMonths } from '@/lib/finance/goalProjection'

/** Format a Date as "MMM YYYY". */
export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// ---------------------------------------------------------------------------
// Projection helpers
// ---------------------------------------------------------------------------

const GOAL_STATUS_PRESENTATION: Record<
  GoalProjection['status'],
  { statusLabel: string; color: keyof typeof rawColors.app }
> = {
  achieved: { statusLabel: 'Achieved', color: 'green' },
  on_track: { statusLabel: 'On Track', color: 'green' },
  slightly_behind: { statusLabel: 'Slightly Behind', color: 'yellow' },
  behind: { statusLabel: 'Behind', color: 'red' },
  no_data: { statusLabel: 'No savings data', color: 'yellow' },
}

/** Compute the full projection for a single goal. */
export function computeGoalProjection(
  goal: FinancialGoal,
  currentAmount: number,
  avgMonthlySavings: number | null,
  now: Date,
): GoalProjection {
  const projection = computeProjection(goal, currentAmount, avgMonthlySavings, now)
  const presentation = GOAL_STATUS_PRESENTATION[projection.status]
  return {
    ...projection,
    statusLabel: presentation.statusLabel,
    statusColor: rawColors.app[presentation.color],
  }
}
