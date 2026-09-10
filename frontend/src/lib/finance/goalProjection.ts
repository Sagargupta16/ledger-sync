import {
  addFractionalMonthsToKey,
  addMonthsToKey,
  MONTHS_PER_YEAR,
  parseLocalDate,
  toLocalDateKey,
} from '@/lib/dateUtils'

export interface GoalProjectionInput {
  target_amount: number
  target_date: string | null
}

/**
 * Where a goal's deadline sits relative to now.
 * - `none` -- open-ended goal, no target_date
 * - `past_due` -- the target date has already passed
 * - `due_soon` -- in the future but under one whole calendar month away, so
 *   there is no meaningful per-month contribution left to quote
 * - `scheduled` -- at least one whole month remains
 */
export type GoalDeadlineState = 'none' | 'past_due' | 'due_soon' | 'scheduled'

export interface GoalProjectionResult {
  /** WHOLE calendar months left until target_date. Never fractional -- see differenceInMonths. */
  monthsRemaining: number
  deadlineState: GoalDeadlineState
  requiredMonthlySavings: number | null
  projectedDate: Date | null
  monthsToComplete: number | null
  status: 'achieved' | 'on_track' | 'slightly_behind' | 'behind' | 'no_data'
  monthsDelta: number | null // positive = ahead of schedule
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Whole calendar months from `fromKey` to `toKey` (`YYYY-MM-DD`, from <= to).
 *
 * The final month only counts once its day-of-month is reached, and the check
 * walks the calendar with `addMonthsToKey` so a month-end anchor clamps instead
 * of overflowing: 31 Jan -> 28 Feb is 1 month, not 0.
 */
function wholeMonthsBetween(fromKey: string, toKey: string): number {
  const monthSpan =
    (Number(toKey.slice(0, 4)) - Number(fromKey.slice(0, 4))) * MONTHS_PER_YEAR +
    (Number(toKey.slice(5, 7)) - Number(fromKey.slice(5, 7)))
  return addMonthsToKey(fromKey, monthSpan) > toKey ? monthSpan - 1 : monthSpan
}

/**
 * Whole calendar months between two dates, signed (negative when `later`
 * precedes `earlier`) and truncated toward zero.
 *
 * Deliberately NOT fractional. The old version added `(later.getDate() -
 * earlier.getDate()) / 30`, so a deadline one day out measured 0.033 months and
 * every per-month figure divided by it blew up ~30x (10x at three days, 3.7x at
 * nine). Sub-month distances are 0 here; callers handle that as a due-now state.
 */
export function differenceInMonths(later: Date, earlier: Date): number {
  const laterKey = toLocalDateKey(later)
  const earlierKey = toLocalDateKey(earlier)
  if (laterKey >= earlierKey) return wholeMonthsBetween(earlierKey, laterKey)
  // Negating a 0 span would hand callers -0, which renders as "-0 months".
  const backwardSpan = wholeMonthsBetween(laterKey, earlierKey)
  return backwardSpan === 0 ? 0 : -backwardSpan
}

/** Add N (possibly fractional) months to a date (returns new Date). */
export function addMonths(date: Date, months: number): Date {
  return parseLocalDate(addFractionalMonthsToKey(toLocalDateKey(date), months))
}

// ---------------------------------------------------------------------------
// Projection helpers
// ---------------------------------------------------------------------------

/**
 * Expected funded percentage from elapsed whole calendar months.
 * Uses the projection's remaining months so the pace shares its reference date.
 */
export function computeGoalPace(
  goal: { start_date: string | null; target_date: string | null },
  projection: Pick<GoalProjectionResult, 'monthsRemaining' | 'status'>,
): number | undefined {
  if (!goal.target_date || !goal.start_date || projection.status === 'achieved')
    return undefined
  const totalSpan = differenceInMonths(parseLocalDate(goal.target_date), parseLocalDate(goal.start_date))
  if (!Number.isFinite(totalSpan) || totalSpan <= 0) return undefined
  const elapsedFraction = (totalSpan - projection.monthsRemaining) / totalSpan
  return Math.max(0, Math.min(100, elapsedFraction * 100))
}

/** Classify how far off a goal's deadline is, given its whole-month count. */
function resolveDeadlineState(
  targetDate: Date | null,
  monthsRemaining: number,
  now: Date,
): GoalDeadlineState {
  if (!targetDate) return 'none'
  if (toLocalDateKey(targetDate) < toLocalDateKey(now)) return 'past_due'
  return monthsRemaining > 0 ? 'scheduled' : 'due_soon'
}

/** Determine the tracking status for a projected date vs. target date. */
function resolveTrackingStatus(
  projected: Date,
  target: Date | null,
  monthsRemaining: number,
  now: Date,
): Pick<GoalProjectionResult, 'status' | 'monthsDelta'> {
  // Measured against the injected `now`, the same instant `monthsRemaining` was
  // measured from -- reading the clock again here made the delta a subtraction
  // between two different reference points.
  const projectedMonths = differenceInMonths(projected, now)
  const monthsDelta = monthsRemaining - projectedMonths // positive = ahead

  // No deadline -> nothing to be behind on.
  if (!target || projected <= target) {
    return { status: 'on_track', monthsDelta }
  }
  const monthsBehind = differenceInMonths(projected, target)
  if (monthsBehind <= 3) {
    return { status: 'slightly_behind', monthsDelta }
  }
  return { status: 'behind', monthsDelta }
}

/** Compute the projection for a single goal without presentation metadata. */
export function computeGoalProjection(
  goal: GoalProjectionInput,
  currentAmount: number,
  avgMonthlySavings: number | null,
  now: Date,
): GoalProjectionResult {
  // target_date is nullable (goals can be open-ended). With no deadline there
  // is no time pressure, so treat months-remaining as 0 (the required-savings
  // branch below guards against divide-by-zero).
  const targetDate = goal.target_date ? parseLocalDate(goal.target_date) : null
  // WHOLE months only: "how much must I save each month" has no answer for a
  // deadline that is days away, so those collapse to 0 and are reported as
  // due_soon / past_due instead of a per-month figure divided by a fraction.
  const monthsRemaining = targetDate ? Math.max(0, differenceInMonths(targetDate, now)) : 0
  const deadlineState = resolveDeadlineState(targetDate, monthsRemaining, now)

  if (currentAmount >= goal.target_amount) {
    return {
      monthsRemaining,
      deadlineState,
      requiredMonthlySavings: null,
      projectedDate: null,
      monthsToComplete: null,
      status: 'achieved',
      monthsDelta: null,
    }
  }

  const amountRemaining = goal.target_amount - currentAmount
  const requiredMonthlySavings = monthsRemaining > 0 ? amountRemaining / monthsRemaining : null

  if (avgMonthlySavings == null || avgMonthlySavings <= 0) {
    return {
      monthsRemaining,
      deadlineState,
      requiredMonthlySavings,
      projectedDate: null,
      monthsToComplete: null,
      status: 'no_data',
      monthsDelta: null,
    }
  }

  const monthsToComplete = amountRemaining / avgMonthlySavings
  const projectedDate = addMonths(now, monthsToComplete)
  const tracking = resolveTrackingStatus(projectedDate, targetDate, monthsRemaining, now)

  return { monthsRemaining, deadlineState, requiredMonthlySavings, projectedDate, monthsToComplete, ...tracking }
}
