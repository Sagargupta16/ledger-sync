import { useIsMutating } from '@tanstack/react-query'

import { useInsightsRefresh } from './useInsightsRefresh'
import { useReviewBatch } from './useReviewBatch'
import { useReviewDecisions } from './useReviewDecisions'
import { REVIEW_WRITE_KEY } from './useReviewQueueApi'
import { useReviewShortcuts } from './useReviewShortcuts'

/**
 * The review deck: the cards on screen, the decisions made on them, and one
 * insights rebuild after the changes. K, C and U work while the picker is closed.
 */
export function useReviewQueue() {
  const pendingWrites = useIsMutating({ mutationKey: REVIEW_WRITE_KEY })
  const batch = useReviewBatch(pendingWrites)
  const insights = useInsightsRefresh(batch.isDone, pendingWrites)
  const decisions = useReviewDecisions({
    current: batch.current,
    take: batch.take,
    giveBack: batch.giveBack,
    countChange: insights.countChange,
  })

  useReviewShortcuts({
    enabled: !decisions.pickerOpen,
    canDecide: batch.current !== null,
    keep: decisions.keep,
    openPicker: decisions.openPicker,
    undo: decisions.undo,
  })

  return {
    current: batch.current,
    next: batch.next,
    options: batch.options,
    progress: batch.progress,
    isLoading: batch.isLoading,
    isError: batch.isError,
    isDone: batch.isDone,
    isEmptyLedger: batch.isEmptyLedger,
    retry: batch.retry,
    isRefreshing: insights.isRefreshing,
    ...decisions,
  }
}
