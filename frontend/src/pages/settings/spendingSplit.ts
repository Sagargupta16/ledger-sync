/**
 * The Needs / Wants / Savings split must total 100%. Mirrors the backend rule
 * in `api/preferences_schemas.py::spending_split_error`, so Save is disabled
 * exactly when the API would answer 422.
 */

import type { LocalPrefs } from './types'

type SplitPrefs = Pick<
  LocalPrefs,
  'needs_target_percent' | 'wants_target_percent' | 'savings_target_percent'
>

/** Element id of the inline split message, for `aria-describedby`. */
export const SPENDING_SPLIT_MESSAGE_ID = 'spending-split-total'

export function spendingSplitTotal(prefs: SplitPrefs): number {
  return prefs.needs_target_percent + prefs.wants_target_percent + prefs.savings_target_percent
}

/** Within 0.01 points of 100; the 1e-9 absorbs float error (33.33 x 3). */
export function isSpendingSplitValid(total: number): boolean {
  return Math.abs(total - 100) <= 0.01 + 1e-9
}

/** "95", "99.98": at most two decimals, no float noise. */
export function formatSplitTotal(total: number): string {
  return String(Number(total.toFixed(2)))
}

export function spendingSplitMessage(total: number): string {
  return `Total ${formatSplitTotal(total)}% -- must be 100%`
}
