import { useCallback, useEffect, useRef } from 'react'

import { useRefreshAfterReview } from './useReviewQueueApi'

/**
 * One insights rebuild for the ledger changes of a visit: when the queue ends
 * with every write saved, or when the page is left mid-queue.
 */
export function useInsightsRefresh(isDone: boolean, pendingWrites: number) {
  const { mutate: refreshInsights, isPending: isRefreshing } = useRefreshAfterReview()
  // Ledger changes since the last rebuild.
  const tally = useRef({ changes: 0 })

  useEffect(() => {
    if (!isDone || pendingWrites > 0 || tally.current.changes === 0) return
    tally.current.changes = 0
    refreshInsights()
  }, [isDone, pendingWrites, refreshInsights])

  // Leaving mid-queue still rebuilds insights for the changes made so far.
  useEffect(() => {
    const counts = tally.current
    return () => {
      if (counts.changes === 0) return
      counts.changes = 0
      refreshInsights()
    }
  }, [refreshInsights])

  /** A change, or the Undo of one, adds a ledger change; a failed save takes it back. */
  const countChange = useCallback((delta: 1 | -1) => {
    tally.current.changes += delta
  }, [])

  return { countChange, isRefreshing }
}
