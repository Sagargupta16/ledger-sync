import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { invalidatePreferenceDependents } from '@/hooks/api/usePreferences'
import {
  assertCurrentSession,
  getSessionGeneration,
  getSessionSignal,
  isCurrentSession,
} from '@/lib/session'
import {
  REVIEW_QUEUE_BATCH,
  reviewQueueService,
  type ReviewRequest,
} from '@/services/api/reviewQueue'
import { uploadService } from '@/services/api/upload'

export const REVIEW_QUEUE_KEY = ['review-queue'] as const
/** Prefix of the decision and undo writes, for `useIsMutating`. */
export const REVIEW_WRITE_KEY = [...REVIEW_QUEUE_KEY, 'write'] as const

/**
 * Writes and the closing refresh share one scope, so they run one at a time in
 * the order made: an Undo never overtakes its review, and the refresh reads
 * every saved decision.
 */
const WRITE_SCOPE = { id: 'review-queue-writes' }

export type ReviewWrite =
  | { kind: 'review'; transactionId: string; body: ReviewRequest }
  | { kind: 'undo'; transactionId: string }

/**
 * A working set, not reference data: it is dropped once the page unmounts, so a
 * later visit never shows cards this one already decided while it refetches.
 */
export function useReviewQueueQuery() {
  return useQuery({
    queryKey: [...REVIEW_QUEUE_KEY, REVIEW_QUEUE_BATCH],
    queryFn: () => reviewQueueService.getQueue(REVIEW_QUEUE_BATCH),
    staleTime: Infinity,
    gcTime: 0,
  })
}

export function useReviewWrite() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...REVIEW_WRITE_KEY, getSessionGeneration()],
    scope: WRITE_SCOPE,
    mutationFn: async (write: ReviewWrite) => {
      assertCurrentSession(sessionSignal)
      if (write.kind === 'undo') return reviewQueueService.undo(write.transactionId)
      await reviewQueueService.review(write.transactionId, write.body)
    },
    onMutate: () => sessionSignal,
    // Each caller reports its own failure and puts the card back; without this
    // the global mutation toast would report it a second time.
    onError: () => undefined,
    onSuccess: (_data, _write, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      // Stale for the next visit only: a refetch now would reshuffle the deck mid-swipe.
      void queryClient.invalidateQueries({ queryKey: REVIEW_QUEUE_KEY, refetchType: 'none' })
    },
  })
}

/**
 * One analytics rebuild after a session of changes, not one per card. The
 * ledger rows changed either way, so the ledger and rollup reads go stale even
 * when the rebuild fails.
 */
export function useRefreshAfterReview() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...REVIEW_QUEUE_KEY, 'refresh', getSessionGeneration()],
    scope: WRITE_SCOPE,
    mutationFn: () => {
      assertCurrentSession(sessionSignal)
      return uploadService.refreshAnalytics()
    },
    onMutate: () => sessionSignal,
    onError: (_error, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      toast.error('Your reviews are saved, but insights did not refresh. Retry from Data Health.')
    },
    onSettled: (_data, _error, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      void invalidatePreferenceDependents(queryClient, false)
    },
  })
}
