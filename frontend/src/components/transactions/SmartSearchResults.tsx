import { useMemo, useState } from 'react'

import type { SortingState } from '@tanstack/react-table'

import ErrorState from '@/components/shared/ErrorState'
import type { ActiveSmartSearch } from '@/hooks/api/useSemanticSearch'
import { getApiErrorMessage } from '@/lib/errorUtils'
import { getActiveLocale } from '@/lib/formatters'
import { useDemoStore } from '@/store/demoStore'
import type { Transaction } from '@/types'

import TransactionTable from './TransactionTable'

const count = (value: number) => value.toLocaleString(getActiveLocale())

/** Relevance order until a date or amount header is clicked. */
function sortRows(rows: Transaction[], sorting: SortingState): Transaction[] {
  const [rule] = sorting
  if (!rule || (rule.id !== 'date' && rule.id !== 'amount')) return rows
  const sign = rule.desc ? -1 : 1
  // Sort a copy with spread; toSorted is newer than the Firefox 114 build target.
  return [...rows].sort((a, b) =>
    sign * (rule.id === 'amount' ? a.amount - b.amount : a.date.localeCompare(b.date)))
}

function captionFor(search: ActiveSmartSearch['search'], shown: number, sorting: SortingState): string {
  if (search.isPending) return 'Searching by meaning...'
  if (search.isFetching) return 'Updating matches...'
  if (shown === 0) return 'No close matches within these filters.'
  const order = sorting.length > 0 ? `sorted by ${sorting[0].id}` : 'best match first'
  return `${shown} closest ${shown === 1 ? 'match' : 'matches'}, ${order}.`
}

/** Said whenever some rows have no vector yet, so a row that is only unindexed never looks absent. */
function coverageNote({ total, indexed, pending }: ActiveSmartSearch['status']): string {
  if (pending === 0) return ''
  return ` Searched ${count(indexed)} of ${count(total)} transactions; ${count(pending)} not indexed yet.`
}

interface SmartSearchResultsProps extends ActiveSmartSearch {
  availableTags: string[]
}

/** The closest transactions to the search text by meaning, best first. */
export default function SmartSearchResults({
  status,
  search,
  availableTags,
}: Readonly<SmartSearchResultsProps>) {
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  const [sorting, setSorting] = useState<SortingState>([])
  const rows = useMemo(
    () => sortRows((search.data?.results ?? []).map((hit) => hit.transaction), sorting),
    [search.data, sorting],
  )

  if (search.isError) {
    return (
      <ErrorState
        variant="inline"
        message={getApiErrorMessage(search.error, 'Smart search failed. Try again.')}
        onRetry={() => void search.refetch()}
      />
    )
  }

  return (
    <section aria-label="Smart search results" className="space-y-2">
      <p className="px-1 text-xs text-text-tertiary" aria-live="polite">
        {captionFor(search, rows.length, sorting)}
        {coverageNote(status)}
        {isDemoMode && ' Demo data is ranked by text similarity.'}
      </p>
      <TransactionTable
        transactions={rows}
        isLoading={search.isPending}
        sorting={sorting}
        onSortingChange={setSorting}
        availableTags={availableTags}
      />
    </section>
  )
}
