/**
 * Analytics V2 -- anomalies: the wire vocabulary, the row shape, and the
 * list/review endpoints.
 */

import { apiClient } from './client'
import { getWrapped } from './analyticsV2Request'

/**
 * Every member of the backend `AnomalyType` enum, in declaration order --
 * `backend/src/ledger_sync/db/_models/enums.py`. The column is
 * `Enum(AnomalyType)`, so these are the only values the wire can carry.
 *
 * Single source of truth for the vocabulary: the union used to list five of the
 * seven, and the page's icon/label maps were keyed off that union, so a
 * `duplicate_suspected` or `missing_recurring` row would have indexed those maps
 * to `undefined` -- an `undefined` spread into a className, and a crash on the
 * severity style whose `.bg` is read straight away.
 */
export const ANOMALY_TYPE_VALUES = [
  'high_expense',
  'unusual_category',
  'large_transfer',
  'duplicate_suspected',
  'missing_recurring',
  'budget_exceeded',
  'closed_account_activity',
] as const

export type AnomalyTypeValue = (typeof ANOMALY_TYPE_VALUES)[number]

/**
 * The subset of the enum any detector actually constructs today.
 *
 * `core/analytics/anomalies.py` only ever appends `HIGH_EXPENSE` (the
 * high-expense-month and large-transaction detectors both use it),
 * `CLOSED_ACCOUNT_ACTIVITY`, and `BUDGET_EXCEEDED`. The other four members exist
 * in the enum with no producer, so a filter chip for them can never return a
 * row. Anything that offers the user a choice must offer THIS list; anything
 * that renders a value the server sent must handle the full enum.
 */
export const EMITTED_ANOMALY_TYPES = [
  'high_expense',
  'budget_exceeded',
  'closed_account_activity',
] as const satisfies readonly AnomalyTypeValue[]

/**
 * Severities in descending order, which is also display order.
 *
 * `severity` is a free-text `String(20)` column, not an enum, so this list is a
 * best-known set rather than a guarantee -- read paths must tolerate a value
 * outside it. `low` stays here because it is readable from the wire (demo mode
 * seeds one, and the column would accept a legacy row), even though no detector
 * writes it.
 */
export const ANOMALY_SEVERITY_VALUES = ['high', 'medium', 'low'] as const

export type AnomalySeverityValue = (typeof ANOMALY_SEVERITY_VALUES)[number]

/**
 * The severities the detectors actually write: `anomalies.py` grades every
 * finding `"high"` or `"medium"` and nothing else. A `Low` filter option
 * therefore returned an empty list 100% of the time, and a `Low` count tile read
 * zero forever.
 */
export const EMITTED_ANOMALY_SEVERITIES = [
  'high',
  'medium',
] as const satisfies readonly AnomalySeverityValue[]

export interface Anomaly {
  id: number
  anomaly_type: AnomalyTypeValue
  severity: AnomalySeverityValue
  description: string
  transaction_id: string | null
  period_key: string | null
  expected_value: number | null
  actual_value: number | null
  deviation_pct: number | null
  detected_at: string
  is_reviewed: boolean
  is_dismissed: boolean
  review_notes: string | null
  reviewed_at: string | null
}

/**
 * The write endpoints answer with a small `{ success, <id> }` acknowledgement.
 *
 * Declared rather than left implicit: without the generic on `apiClient.post`,
 * axios infers `any`, so `response.data` was returned as `any` and every caller
 * downstream lost checking on a value it is entitled to read (the created id is
 * the only way to link a mutation back to its row).
 */
export interface AnomalyReviewResult {
  success: boolean
  anomaly_id: number
}

export const anomaliesApi = {
  // Anomalies
  //
  // `type` is the handler's Query alias for `anomaly_type`, so the wire name is
  // correct. The handler declares type / severity / include_reviewed / limit;
  // `offset` was dropped.
  getAnomalies(params?: {
    type?: string
    severity?: string
    include_reviewed?: boolean
    limit?: number
  }) {
    return getWrapped<Anomaly>('/api/analytics/v2/anomalies', params)
  },

  async reviewAnomaly(anomalyId: number, data: { dismiss: boolean; notes?: string }) {
    // JSON BODY, not query params. The endpoint declares `body:
    // ReviewAnomalyRequest`, so posting a null body with `params: data` was
    // rejected 422 `{"loc": ["body"], "msg": "Field required"}` on every call --
    // the Review and Dismiss buttons on /anomalies could never succeed.
    // Reproduced against the real app at 2026-07-27 and pinned in
    // backend/tests/integration/test_anomaly_review.py.
    const response = await apiClient.post<AnomalyReviewResult>(
      `/api/analytics/v2/anomalies/${anomalyId}/review`,
      data,
    )
    return response.data
  },
}
