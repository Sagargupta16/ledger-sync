/**
 * The ONE params object for "active recurring commitments".
 *
 * `/analytics/v2/recurring-transactions` defaults `min_confidence` to 50, and
 * the query key carries every param, so callers that spelled the same request
 * with and without `min_confidence: 0` held two cache entries for two different
 * answers: the Dashboard's fixed-cost total counted low-confidence commitments
 * while the sidebar badge, notification centre and the app-wide prefetch
 * dropped them. Every caller asking for active commitments passes this object,
 * so there is one request, one cache entry and one count.
 *
 * `min_confidence: 0` because a commitment detected from a few occurrences is
 * still owed -- `summarizeRecurringCommitments` separates older unconfirmed
 * detections for review instead of hiding them.
 */
export const RECURRING_COMMITMENTS_PARAMS = {
  active_only: true,
  min_confidence: 0,
  pattern_kind: 'commitment',
} as const
