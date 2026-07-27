import type { FinancialGoal } from '@/hooks/api/useAnalyticsV2'
import {
  addDaysToKey,
  addMonthsToKey,
  DAYS_PER_AVG_MONTH,
  MONTHS_PER_YEAR,
  parseLocalDate,
  toLocalDateKey,
} from '@/lib/dateUtils'
import { rawColors } from '@/constants/colors'
import {
  ALLOCATION_STORAGE_KEY,
  DELETED_GOALS_STORAGE_KEY,
  GOAL_OVERRIDES_STORAGE_KEY,
} from './constants'
import type { GoalProjection, GoalOverride } from './types'

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
  // Whole months step the real calendar via `addMonthsToKey`; only the leftover
  // fraction is spread over average days. `setMonth` overflowed month-end
  // anchors (31 Jan + 1 month landed on 3 March) and `* 30` mis-sized every
  // month it stepped.
  const wholeMonths = Math.floor(months)
  const remainderDays = Math.round((months - wholeMonths) * DAYS_PER_AVG_MONTH)
  return parseLocalDate(addDaysToKey(addMonthsToKey(toLocalDateKey(date), wholeMonths), remainderDays))
}

/** Format a Date as "MMM YYYY". */
export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// ---------------------------------------------------------------------------
// Projection helpers
// ---------------------------------------------------------------------------

/** Classify how far off a goal's deadline is, given its whole-month count. */
function resolveDeadlineState(
  targetDate: Date | null,
  monthsRemaining: number,
  now: Date,
): GoalProjection['deadlineState'] {
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
): Pick<GoalProjection, 'status' | 'statusLabel' | 'statusColor' | 'monthsDelta'> {
  // Measured against the injected `now`, the same instant `monthsRemaining` was
  // measured from -- reading the clock again here made the delta a subtraction
  // between two different reference points.
  const projectedMonths = differenceInMonths(projected, now)
  const monthsDelta = monthsRemaining - projectedMonths // positive = ahead

  // No deadline -> nothing to be behind on.
  if (!target || projected <= target) {
    return { status: 'on_track', statusLabel: 'On Track', statusColor: rawColors.app.green, monthsDelta }
  }
  const monthsBehind = differenceInMonths(projected, target)
  if (monthsBehind <= 3) {
    return { status: 'slightly_behind', statusLabel: 'Slightly Behind', statusColor: rawColors.app.yellow, monthsDelta }
  }
  return { status: 'behind', statusLabel: 'Behind', statusColor: rawColors.app.red, monthsDelta }
}

/** Compute the full projection for a single goal. */
export function computeGoalProjection(
  goal: FinancialGoal,
  currentAmount: number,
  avgMonthlySavings: number | null,
  now: Date,
): GoalProjection {
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
      statusLabel: 'Achieved',
      statusColor: rawColors.app.green,
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
      statusLabel: 'No savings data',
      statusColor: rawColors.app.yellow,
      monthsDelta: null,
    }
  }

  const monthsToComplete = amountRemaining / avgMonthlySavings
  const projectedDate = addMonths(now, monthsToComplete)
  const tracking = resolveTrackingStatus(projectedDate, targetDate, monthsRemaining, now)

  return { monthsRemaining, deadlineState, requiredMonthlySavings, projectedDate, monthsToComplete, ...tracking }
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

/** Read goal allocations from localStorage. */
export function loadAllocations(): Record<string, number> {
  try {
    const raw = localStorage.getItem(ALLOCATION_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, number>
  } catch (e) {
    console.warn('[loadAllocations] Failed to read localStorage:', e)
    return {}
  }
}

/** Persist goal allocations to localStorage. */
export function saveAllocations(allocations: Record<string, number>): void {
  try {
    localStorage.setItem(ALLOCATION_STORAGE_KEY, JSON.stringify(allocations))
  } catch (e) {
    console.warn('[saveAllocations] Failed to write localStorage:', e)
  }
}

/** Read hidden (deleted) goal IDs from localStorage. */
export function loadDeletedGoals(): Set<number> {
  try {
    const raw = localStorage.getItem(DELETED_GOALS_STORAGE_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as number[])
  } catch (e) {
    console.warn('[loadDeletedGoals] Failed to read localStorage:', e)
    return new Set()
  }
}

/** Persist hidden (deleted) goal IDs to localStorage. */
export function saveDeletedGoals(ids: Set<number>): void {
  try {
    localStorage.setItem(DELETED_GOALS_STORAGE_KEY, JSON.stringify([...ids]))
  } catch (e) {
    console.warn('[saveDeletedGoals] Failed to write localStorage:', e)
  }
}

/** Read goal overrides from localStorage. */
export function loadGoalOverrides(): Record<number, GoalOverride> {
  try {
    const raw = localStorage.getItem(GOAL_OVERRIDES_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<number, GoalOverride>
  } catch (e) {
    console.warn('[loadGoalOverrides] Failed to read localStorage:', e)
    return {}
  }
}

/** Persist goal overrides to localStorage. */
export function saveGoalOverrides(overrides: Record<number, GoalOverride>): void {
  try {
    localStorage.setItem(GOAL_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides))
  } catch (e) {
    console.warn('[saveGoalOverrides] Failed to write localStorage:', e)
  }
}
