/**
 * Severity tallies the page displays.
 *
 * There is no `low` field: no detector in `core/analytics/anomalies.py` ever
 * writes that severity (every finding is graded `"high"` or `"medium"`), so a Low
 * count tile read zero on every account forever. `Anomaly['severity']` still
 * PARSES `'low'` -- the backend column is free text and demo mode seeds one -- so
 * `total` counts every row regardless of severity and the mix bar shows anything
 * outside the graded set as a neutral remainder instead of dropping it.
 */
export interface AnomalySummaryCounts {
  high: number
  medium: number
  /** All anomalies in the current `include_reviewed` scope, any severity. */
  total: number
}
