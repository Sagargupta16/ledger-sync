import type { AnomalyTypeValue } from '@/services/api/analyticsV2Anomalies'

/**
 * Severity tallies the page displays.
 *
 * There is no `low` field: no detector ever writes that severity (every finding
 * is graded `"high"` or `"medium"`), so a Low count tile read zero on every
 * account forever. `Anomaly['severity']` still PARSES `'low'` -- the backend
 * column is free text -- so `total` counts every row regardless of severity and
 * the mix bar shows anything outside the graded set as a neutral remainder
 * instead of dropping it.
 */
export interface AnomalySummaryCounts {
  high: number
  medium: number
  /** All anomalies in the current `include_reviewed` scope, any severity. */
  total: number
  /** Rows per type in the same scope, in display order; types with none left out. */
  byType: readonly { type: AnomalyTypeValue; count: number }[]
  /** Fee and interest rows in the same scope: how many, and what they cost. */
  fees: { count: number; total: number }
}
