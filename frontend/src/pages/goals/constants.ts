import { rawColors } from '@/constants/colors'
import { GOAL_TYPE_VALUES, type GoalTypeValue } from '@/services/api/analyticsV2'

export const ALLOCATION_STORAGE_KEY = 'ledger-sync-goal-allocations'
export const DELETED_GOALS_STORAGE_KEY = 'ledger-sync-deleted-goals'
export const GOAL_OVERRIDES_STORAGE_KEY = 'ledger-sync-goal-overrides'

/**
 * Colour and label per goal type. Exhaustive over `GOAL_TYPE_VALUES`, so adding a
 * type there fails type-check here instead of at render time.
 *
 * Read these through `goalTypeColor()` / `goalTypeLabel()`, never by direct index.
 * `goal_type` is an unvalidated `String(50)` column and `CreateGoalRequest`
 * defaults it to a bare `str`, so a row can carry a value outside this list --
 * from an older build, a direct API call, or a future type. Indexing the record
 * with one returned `undefined`, and `GoalCard` interpolated that straight into a
 * style: `backgroundColor: \`${undefined}20\`` is the literal string
 * `"undefined20"`, which is not a colour, so the browser discarded the whole
 * declaration and the goal-type chip rendered with no background -- and, because
 * `color` was `undefined` in the same object, no text colour either. The same
 * `undefined` also reached `CircularProgress` and `ProgressBar`.
 */
export const GOAL_TYPE_COLORS: Record<GoalTypeValue, string> = {
  savings: rawColors.app.green,
  debt_payoff: rawColors.app.red,
  investment: rawColors.app.blue,
  expense_reduction: rawColors.app.orange,
  income_increase: rawColors.app.purple,
  custom: rawColors.app.teal,
}

export const GOAL_TYPE_LABELS: Record<GoalTypeValue, string> = {
  savings: 'Savings',
  debt_payoff: 'Debt Payoff',
  investment: 'Investment',
  expense_reduction: 'Expense Reduction',
  income_increase: 'Income Increase',
  custom: 'Custom',
}

/** Options for any goal-type picker, so no surface hand-rolls the list. */
export const GOAL_TYPE_OPTIONS: readonly { value: GoalTypeValue; label: string }[] =
  GOAL_TYPE_VALUES.map((value) => ({ value, label: GOAL_TYPE_LABELS[value] }))

/** Neutral chart grey for a goal type this build does not know about. */
const UNKNOWN_GOAL_TYPE_COLOR = rawColors.chart.neutral

export function goalTypeColor(goalType: string): string {
  return GOAL_TYPE_COLORS[goalType as GoalTypeValue] ?? UNKNOWN_GOAL_TYPE_COLOR
}

/**
 * Human label for a goal type, falling back to the stored value.
 *
 * The raw token is a worse label than "Savings" but a far better one than the
 * empty chip the direct index produced: it still tells the user what the goal is
 * classified as.
 */
export function goalTypeLabel(goalType: string): string {
  return GOAL_TYPE_LABELS[goalType as GoalTypeValue] ?? goalType
}
