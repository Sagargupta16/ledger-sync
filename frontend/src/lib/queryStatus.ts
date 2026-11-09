/**
 * One status for a page or panel built from several reads.
 *
 * A read that fails while it still holds data (a background refetch after an
 * upload or a settings save) keeps that data: TanStack Query leaves `data` in
 * place and only sets `isError`. Treating that as a page error threw away
 * figures that were on screen a moment ago and swapped the whole page, toolbar
 * included, for an error card. So a failure only blocks when the read has
 * nothing to show; otherwise the page stays and says the refresh failed.
 *
 * The three kinds are exclusive, so a page's `if` ladder no longer depends on
 * whether it checks loading or error first.
 */

/** The part of a query result (or a read derived from one) the status reads. */
export interface StatusRead {
  readonly data: unknown
  readonly isError: boolean
  /** TanStack's `isLoading`: a first fetch in flight (a disabled query never loads). */
  readonly isLoading?: boolean
  readonly refetch: () => Promise<unknown>
}

export type PageStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly retry: () => void }
  | { readonly kind: 'ready'; readonly refreshFailed: boolean; readonly retry: () => void }

type Reads = readonly (StatusRead | null | undefined)[]

function present(reads: Reads): StatusRead[] {
  return reads.filter((read): read is StatusRead => read != null)
}

/** A read failed and has no data to show: the page cannot render it. */
export function blockingError(reads: Reads): boolean {
  return present(reads).some((read) => read.isError && read.data === undefined)
}

/** A read failed but kept the data it had: show it, and say it is not the latest. */
export function refreshFailed(reads: Reads): boolean {
  return present(reads).some((read) => read.isError && read.data !== undefined)
}

/** Refetch only the reads that failed; the others already hold current data. */
export function retryFailed(reads: Reads): Promise<unknown> {
  return Promise.all(
    present(reads)
      .filter((read) => read.isError)
      .map((read) => read.refetch()),
  )
}

/**
 * The page status for `reads`. `loading` adds a signal the reads do not carry
 * (a period snapshot's first load, a store that has not hydrated).
 */
export function pageStatus(reads: Reads, loading = false): PageStatus {
  const retry = () => void retryFailed(reads)
  if (blockingError(reads)) return { kind: 'error', retry }
  if (loading || present(reads).some((read) => read.isLoading)) return { kind: 'loading' }
  return { kind: 'ready', refreshFailed: refreshFailed(reads), retry }
}
