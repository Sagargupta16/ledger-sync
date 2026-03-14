import type { FinancialGoal } from '@/hooks/api/useAnalyticsV2'
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

/** Difference in months between two dates (fractional). */
export function differenceInMonths(later: Date, earlier: Date): number {
  const yearDiff = later.getFullYear() - earlier.getFullYear()
  const monthDiff = later.getMonth() - earlier.getMonth()
  const dayFraction = (later.getDate() - earlier.getDate()) / 30
  return yearDiff * 12 + monthDiff + dayFraction
}

/** Add N months to a date (returns new Date). */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  const wholeMonths = Math.floor(months)
  const dayFraction = months - wholeMonths
  result.setMonth(result.getMonth() + wholeMonths)
  result.setDate(result.getDate() + Math.round(dayFraction * 30))
  return result
}

/** Format a Date as "MMM YYYY". */
export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// ---------------------------------------------------------------------------
// Projection helpers
// ---------------------------------------------------------------------------

/** Determine the tracking status for a projected date vs. target date. */
function resolveTrackingStatus(
  projected: Date,
  target: Date,
  monthsRemaining: number,
): Pick<GoalProjection, 'status' | 'statusLabel' | 'statusColor' | 'monthsDelta'> {
  const projectedMonths = differenceInMonths(projected, new Date())
  const monthsDelta = monthsRemaining - projectedMonths // positive = ahead

  if (projected <= target) {
    return { status: 'on_track', statusLabel: 'On Track', statusColor: rawColors.ios.green, monthsDelta }
  }
  const monthsBehind = differenceInMonths(projected, target)
  if (monthsBehind <= 3) {
    return { status: 'slightly_behind', statusLabel: 'Slightly Behind', statusColor: rawColors.ios.yellow, monthsDelta }
  }
  return { status: 'behind', statusLabel: 'Behind', statusColor: rawColors.ios.red, monthsDelta }
}

/** Compute the full projection for a single goal. */
export function computeGoalProjection(
  goal: FinancialGoal,
  currentAmount: number,
  avgMonthlySavings: number | null,
  now: Date,
): GoalProjection {
  const targetDate = new Date(goal.target_date)
  const monthsRemaining = Math.max(0, differenceInMonths(targetDate, now))

  if (currentAmount >= goal.target_amount) {
    return {
      monthsRemaining,
      requiredMonthlySavings: null,
      projectedDate: null,
      monthsToComplete: null,
      status: 'achieved',
      statusLabel: 'Achieved',
      statusColor: rawColors.ios.green,
      monthsDelta: null,
    }
  }

  const amountRemaining = goal.target_amount - currentAmount
  const requiredMonthlySavings = monthsRemaining > 0 ? amountRemaining / monthsRemaining : null

  if (avgMonthlySavings == null || avgMonthlySavings <= 0) {
    return {
      monthsRemaining,
      requiredMonthlySavings,
      projectedDate: null,
      monthsToComplete: null,
      status: 'no_data',
      statusLabel: 'No savings data',
      statusColor: rawColors.ios.yellow,
      monthsDelta: null,
    }
  }

  const monthsToComplete = amountRemaining / avgMonthlySavings
  const projectedDate = addMonths(now, monthsToComplete)
  const tracking = resolveTrackingStatus(projectedDate, targetDate, monthsRemaining)

  return { monthsRemaining, requiredMonthlySavings, projectedDate, monthsToComplete, ...tracking }
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
