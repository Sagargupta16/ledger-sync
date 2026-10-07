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
 * in the same render, so all values switch together. A read that errored
 * counts as settled -- its data is `undefined` and the page's own error state
 * takes over -- so a failed request never pins the page on stale figures.
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
export type PeriodReadData<R extends readonly (PeriodRead | null)[]> = {
  -readonly [K in keyof R]: ReadData<R[K]>
}

export interface StablePeriodData<P, D> {
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
  if (read.isError) return true
  return read.data !== undefined && !read.isPlaceholderData
}

export function useStablePeriodData<P, const R extends readonly (PeriodRead | null)[]>(
  period: P,
  reads: R,
): StablePeriodData<P, PeriodReadData<R>> {
  const [committed, setCommitted] = useState<Snapshot<P, PeriodReadData<R>> | null>(null)
  const data = reads.map((read) => read?.data) as PeriodReadData<R>

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
