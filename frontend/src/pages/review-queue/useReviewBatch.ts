import { useCallback, useEffect, useMemo, useState } from 'react'

import type { ReviewItem, ReviewQueue } from '@/services/api/reviewQueue'

import { openItems, optionsFor, progressCounts } from './reviewQueueUtils'
import { useReviewQueueQuery } from './useReviewQueueApi'

const without = (ids: ReadonlySet<string>, id: string) => new Set([...ids].filter((x) => x !== id))

/**
 * The cards on screen: those Undo brought back, then the server's batch, minus
 * decided rows. The next batch is read only once every decision is saved
 * (`pendingWrites` is 0), so the server already leaves them out. A failed read
 * waits for Retry instead of looping.
 */
export function useReviewBatch(pendingWrites: number) {
  const query = useReviewQueueQuery()
  const [decided, setDecided] = useState<ReadonlySet<string>>(() => new Set())
  const [restored, setRestored] = useState<ReviewItem[]>([])
  // The batch a follow-up read was started from, so an identical answer ends the queue.
  const [readAfter, setReadAfter] = useState<ReviewQueue | null>(null)

  const data = query.data
  const queue = useMemo(
    () => openItems(data?.items ?? [], restored, decided),
    [data, restored, decided],
  )
  const current = queue[0] ?? null
  const moreOnServer = data !== undefined && data.remaining > data.items.length
  const needsMore = data !== undefined && current === null && moreOnServer && readAfter !== data
  const { refetch, isFetching, isError: readFailed } = query

  useEffect(() => {
    if (!needsMore || pendingWrites > 0 || isFetching || readFailed || !data) return
    void refetch().then((result) => {
      if (result.isSuccess) setReadAfter(data)
    })
  }, [needsMore, pendingWrites, isFetching, readFailed, data, refetch])

  /** A decided card leaves the deck. */
  const take = useCallback((item: ReviewItem) => {
    const id = item.transaction_id
    setDecided((ids) => new Set(ids).add(id))
    setRestored((items) => items.filter((entry) => entry.transaction_id !== id))
  }, [])

  /** An undone or unsaved card goes back on top. */
  const giveBack = useCallback((item: ReviewItem) => {
    const id = item.transaction_id
    setDecided((ids) => without(ids, id))
    setRestored((items) => [item, ...items.filter((entry) => entry.transaction_id !== id)])
  }, [])

  return {
    current,
    next: queue[1] ?? null,
    options: current && data ? optionsFor(data.categories, current) : [],
    progress: data ? progressCounts(data, decided, restored) : null,
    isLoading: query.isLoading || (needsMore && !readFailed),
    isError: readFailed && (!data || needsMore),
    isDone: data !== undefined && current === null && !needsMore,
    // No income or expense row at all: there is nothing a review could cover yet.
    isEmptyLedger: data !== undefined && data.window_start === null,
    take,
    giveBack,
    retry: () => void refetch(),
  }
}
