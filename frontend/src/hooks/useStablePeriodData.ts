import { useState } from 'react'

import { hashKey } from '@tanstack/react-query'

/**
 * Holds a page on its last fully consistent period snapshot while the reads
 * for a newly selected period are in flight.
 *
 * Pages that combine several period-keyed reads cannot just add
 * `placeholderData: keepPreviousData` to each one: a read whose new key is
 * already cached resolves at once while its siblings still show the previous
 * period, so a single render would mix two ranges. Swapping to the skeleton
 * instead collapses the page (about 1,060px) and throws a reader who scrolled
 * down back to the top.
 *
 * Give this hook the selected period and every read that period keys. While
 * ANY read is placeholder data or has no data yet, it returns the previously
 * committed `period` and `data` (all from one range) with `isSettling` set;
 * once every read holds real data for the selection, it commits the new pair
 * in the same render, so all values switch together. A read that failed with
 * no data hands back the current reads so the page's own error state takes
 * over -- a failed request never pins the page on stale figures --
 * but it is never committed: TanStack sends a failed read with no data back
 * to pending on retry, and a committed `undefined` snapshot would then show
 * as zeros or "no transactions" while the retry runs. A read that failed but
 * kept its data commits that data like any settled read.
 * Pass `null` for a read the current selection does not use (a disabled
 * query); it neither blocks nor contributes data.
 *
 * Before anything has been committed, `isInitialLoad` is true and the page
 * shows its usual first-load skeleton.
 */

/** The part of a query result (or a read derived from one) this hook inspects. */
export interface PeriodRead<T = unknown> {
  readonly data: T | undefined
  /** TanStack's flag for `keepPreviousData` holding the previous key's data. */
  readonly isPlaceholderData?: boolean
  readonly isError?: boolean
  /**
   * TanStack's `dataUpdatedAt`. Lets a same-period refetch (an upload, a
   * settings save) refresh the committed snapshot; data identity is not used,
   * so a read rebuilt on every render cannot loop.
   */
  readonly dataUpdatedAt?: number
}

type ReadData<R> = R extends PeriodRead<infer T> ? T | undefined : undefined

/** The `data` of each read, position for position. */
type PeriodReadData<R extends readonly (PeriodRead | null)[]> = {
  -readonly [K in keyof R]: ReadData<R[K]>
}

interface StablePeriodData<P, D> {
  /** The period `data` belongs to: the selection once settled, the previous one while settling. */
  readonly period: P
  readonly data: D
  /** A newer selection is loading; `period` and `data` are the last consistent snapshot. */
  readonly isSettling: boolean
  /** Nothing has been committed yet: the page's first load. */
  readonly isInitialLoad: boolean
}

interface Snapshot<P, D> {
  readonly period: P
  readonly data: D
  readonly signature: string
}

function isSettled(read: PeriodRead | null): boolean {
  if (read === null) return true
  return read.data !== undefined && !read.isPlaceholderData
}

function failedWithoutData(read: PeriodRead | null): boolean {
  return read?.isError === true && read.data === undefined
}

export function useStablePeriodData<P, const R extends readonly (PeriodRead | null)[]>(
  period: P,
  reads: R,
): StablePeriodData<P, PeriodReadData<R>> {
  const [committed, setCommitted] = useState<Snapshot<P, PeriodReadData<R>> | null>(null)
  const data = reads.map((read) => read?.data) as PeriodReadData<R>

  if (reads.some(failedWithoutData)) return { period, data, isSettling: false, isInitialLoad: false }

  if (reads.every(isSettled)) {
    const signature = hashKey([period, reads.map((read) => read?.dataUpdatedAt ?? null)])
    // Render-phase adjustment, the "store information from previous renders"
    // pattern: it runs once per new period or refetch, never every render.
    if (committed?.signature !== signature) setCommitted({ period, data, signature })
    return { period, data, isSettling: false, isInitialLoad: false }
  }

  if (committed === null) return { period, data, isSettling: false, isInitialLoad: true }
  return { period: committed.period, data: committed.data, isSettling: true, isInitialLoad: false }
}
