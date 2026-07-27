import { useCallback, useMemo, useState } from 'react'

import { useMerchantIntelligence } from '@/hooks/api/useAnalyticsV2'

import {
  PARETO_THRESHOLD,
  computeStats,
  countKinds,
  filterByKind,
  toSpendByLabel,
  usableMerchants,
} from './merchantUtils'
import type { KindFilter, MerchantRow } from './types'

/**
 * The rollup already drops single-payment labels, so 2 is the real floor.
 * Asking for it explicitly (instead of taking the endpoint's default of 3)
 * keeps two-payment merchants visible -- they are exactly the ones a user has
 * forgotten about.
 */
export const MIN_TRANSACTIONS = 2

/** Endpoint cap (`Query(ge=1, le=200)`); ask for all of it in one round trip. */
export const ROW_LIMIT = 200

export interface UseMerchantIntelResult {
  readonly isLoading: boolean
  readonly isError: boolean
  readonly retry: () => void
  /** True when the rollup itself is empty (no notes, or analytics never built). */
  readonly isEmpty: boolean
  /** True when the current filters -- not the data -- produced nothing. */
  readonly isFilteredEmpty: boolean
  readonly rows: readonly MerchantRow[]
  readonly stats: ReturnType<typeof computeStats>
  readonly kindCounts: ReturnType<typeof countKinds>
  readonly kindFilter: KindFilter
  readonly setKindFilter: (next: KindFilter) => void
  readonly recurringOnly: boolean
  readonly setRecurringOnly: (next: boolean) => void
  readonly search: string
  readonly setSearch: (next: string) => void
  readonly spendByLabel: Record<string, number>
  readonly threshold: number
  /** Rows the API returned that predate `label_kind`; drives an honesty note. */
  readonly unclassifiedCount: number
  /** Rows returned by the API before placeholder filtering, for the caveat line. */
  readonly returnedCount: number
  readonly atRowLimit: boolean
}

/**
 * Merchant intelligence, read from the server-side rollup.
 *
 * One request, then all slicing happens in memory over at most 200 rows. The
 * alternative -- re-requesting per filter -- would burn a round trip per toggle
 * for a payload this small, and `label_kind` is not even wired through the
 * shared query-key factory, so a server-side kind filter would collide in cache.
 */
export function useMerchantIntel(): UseMerchantIntelResult {
  const { data, isPending, isError, refetch } = useMerchantIntelligence({
    min_transactions: MIN_TRANSACTIONS,
    limit: ROW_LIMIT,
  })

  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [recurringOnly, setRecurringOnly] = useState(false)
  const [search, setSearch] = useState('')

  const returned = useMemo<readonly MerchantRow[]>(() => data ?? [], [data])
  const usable = useMemo(() => usableMerchants(returned), [returned])
  const kindCounts = useMemo(() => countKinds(usable), [usable])

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return filterByKind(usable, kindFilter).filter((row) => {
      if (recurringOnly && !row.is_recurring) return false
      if (needle.length === 0) return true
      if (row.merchant.toLowerCase().includes(needle)) return true
      return row.category.toLowerCase().includes(needle)
    })
  }, [usable, kindFilter, recurringOnly, search])

  const stats = useMemo(() => computeStats(rows, PARETO_THRESHOLD), [rows])
  const spendByLabel = useMemo(() => toSpendByLabel(rows), [rows])

  const retry = useCallback(() => {
    void refetch()
  }, [refetch])

  return {
    isLoading: isPending,
    isError,
    retry,
    isEmpty: !isPending && usable.length === 0,
    isFilteredEmpty: usable.length > 0 && rows.length === 0,
    rows,
    stats,
    kindCounts,
    kindFilter,
    setKindFilter,
    recurringOnly,
    setRecurringOnly,
    search,
    setSearch,
    spendByLabel,
    threshold: PARETO_THRESHOLD,
    unclassifiedCount: kindCounts.unclassified,
    returnedCount: returned.length,
    atRowLimit: returned.length >= ROW_LIMIT,
  }
}
