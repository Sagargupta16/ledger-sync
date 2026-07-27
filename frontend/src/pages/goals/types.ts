/**
 * Where a goal's deadline sits relative to now.
 * - `none` -- open-ended goal, no target_date
 * - `past_due` -- the target date has already passed
 * - `due_soon` -- in the future but under one whole calendar month away, so
 *   there is no meaningful per-month contribution left to quote
 * - `scheduled` -- at least one whole month remains
 */
export type GoalDeadlineState = 'none' | 'past_due' | 'due_soon' | 'scheduled'

export interface GoalProjection {
  /** WHOLE calendar months left until target_date. Never fractional -- see helpers. */
  monthsRemaining: number
  deadlineState: GoalDeadlineState
  requiredMonthlySavings: number | null
  projectedDate: Date | null
  monthsToComplete: number | null
  status: 'achieved' | 'on_track' | 'slightly_behind' | 'behind' | 'no_data'
  statusLabel: string
  statusColor: string
  monthsDelta: number | null // positive = ahead of schedule
}

export type GoalOverride = {
  name: string
  target_amount: number
  target_date: string
}
