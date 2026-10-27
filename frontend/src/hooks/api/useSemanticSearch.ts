/**
 * Smart (semantic) transaction search over opt-in Titan embeddings: the index
 * status, ranked results, and the batch loop that builds or updates the index.
 * Nothing is embedded until `useBuildSemanticIndex().mutate()` runs.
 */

import { useEffect, useMemo, useState } from 'react'

import {
  keepPreviousData,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { isAxiosError } from 'axios'

import type { FilterValues } from '@/components/transactions/TransactionFilters'
import { useDebounce } from '@/hooks/useDebounce'
import { getApiErrorMessage } from '@/lib/errorUtils'
import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'
import {
  semanticSearchService,
  type SemanticIndexBatch,
  type SemanticSearchParams,
  type SemanticSearchResults,
  type SemanticSearchStatus,
} from '@/services/api/semanticSearch'

const SEMANTIC_SEARCH_KEY = ['semantic-search'] as const
const STATUS_KEY = [...SEMANTIC_SEARCH_KEY, 'status'] as const
const RESULTS_KEY = [...SEMANTIC_SEARCH_KEY, 'results'] as const
const INDEX_KEY = [...SEMANTIC_SEARCH_KEY, 'index'] as const
const AI_USAGE_KEY = ['ai-usage'] as const

/** Batch starts are spaced so the loop stays under the endpoint's 30-per-minute limit. */
const MIN_BATCH_INTERVAL_MS = 2_100
/** The closest matches the page asks for. */
const RESULT_LIMIT = 50
/** Dates and amounts change while typing; only a settled value costs a metered search. */
const FILTER_SETTLE_MS = 300
/** Signals that the shown rows changed arrive in bursts; one refetch per burst. */
const SIGNAL_WINDOW_MS = 50
/** 400, 429 and 503 mean smart search cannot run now (settings, budget, server), not that the query failed. */
const STEP_ASIDE_STATUSES = new Set([400, 429, 503])

const followed = new WeakSet<QueryClient>()

/**
 * Smart results are metered (each fetch embeds the query), so they stay cached
 * until something changes the rows they show. Two signals say so, and neither
 * needs every writer's key list repeated here: `['transactions-page']` being
 * invalidated (an excluded account, a rule run, an upload, a tag edit made on
 * the page), and a finished tag write itself (so results shown without that
 * query never keep old tags). One burst of signals becomes one refetch.
 */
function followLedgerWrites(client: QueryClient) {
  if (followed.has(client)) return
  followed.add(client)
  let scheduled = false
  const refresh = () => {
    if (scheduled) return
    scheduled = true
    // A write signals twice, a few promise ticks apart (its onSuccess, then its success event).
    setTimeout(() => {
      scheduled = false
      void client.invalidateQueries({ queryKey: SEMANTIC_SEARCH_KEY })
    }, SIGNAL_WINDOW_MS)
  }
  client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'invalidate') return
    const [family] = event.query.queryKey as readonly unknown[]
    if (family === 'transactions-page') refresh()
  })
  client.getMutationCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return
    const key: readonly unknown[] | undefined = event.mutation.options.mutationKey
    if (key?.[0] === 'transactions' && key[1] === 'tags') refresh()
  })
}

function useSemanticSearchStatus(enabled: boolean) {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: ({ signal }) => semanticSearchService.getStatus(signal),
    enabled,
    // Uploads on other pages change what is pending without touching this key,
    // so turning Smart search on always rechecks. The read is cheap and local.
    staleTime: 0,
  })
}

function useSemanticSearch(params: SemanticSearchParams, enabled: boolean) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: [...RESULTS_KEY, params],
    queryFn: async ({ signal }) => {
      const results = await semanticSearchService.search(params, signal)
      // The search was metered: refresh the usage badge and Settings counts.
      void queryClient.invalidateQueries({ queryKey: AI_USAGE_KEY })
      return results
    },
    enabled,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    // Every attempt embeds the query again, and a 429 or 503 will not fix itself.
    retry: false,
  })
}

/** The server's reason when smart search cannot run right now; null for any other failure. */
function stepAsideMessage(error: unknown): string | null {
  if (!isAxiosError(error) || !STEP_ASIDE_STATUSES.has(error.response?.status ?? 0)) return null
  return getApiErrorMessage(error, 'Smart search is unavailable right now.')
}

/** The page filters the backend applies before ranking; the word match is replaced by `q`. */
function toParams(text: string, filters: Omit<FilterValues, 'query'>): SemanticSearchParams {
  return {
    q: text,
    limit: RESULT_LIMIT,
    category: filters.category || undefined,
    account: filters.account || undefined,
    type: filters.type || undefined,
    tag: filters.tag || undefined,
    start_date: filters.start_date || undefined,
    end_date: filters.end_date || undefined,
    min_amount: filters.min_amount,
    max_amount: filters.max_amount,
  }
}

export interface ActiveSmartSearch {
  status: SemanticSearchStatus
  search: UseQueryResult<SemanticSearchResults>
}

/**
 * Smart search state for the Transactions page. `active` is set only once the
 * index can answer a typed query; until then the page keeps its regular word
 * match. When the server says smart search cannot run now (budget spent,
 * throttled, no Bedrock) the hook steps aside with that reason in `pausedFor`
 * instead of repeating the doomed call for every keystroke; `resume` retries.
 */
export function useSmartSearchMode(enabled: boolean, filters: FilterValues) {
  const queryClient = useQueryClient()
  useEffect(() => followLedgerWrites(queryClient), [queryClient])

  const statusQuery = useSemanticSearchStatus(enabled)
  const [pausedFor, setPausedFor] = useState<string | null>(null)
  const status = statusQuery.data
  const usable = enabled && status?.available && status.indexed > 0 ? status : undefined
  const text = usable && pausedFor === null ? (filters.query ?? '').trim() : ''

  const { category, account, type, tag, start_date, end_date, min_amount, max_amount } = filters
  const rest = useMemo(
    () => ({ category, account, type, tag, start_date, end_date, min_amount, max_amount }),
    [category, account, type, tag, start_date, end_date, min_amount, max_amount],
  )
  const settled = useDebounce(rest, FILTER_SETTLE_MS)
  const params = useMemo(() => toParams(text, settled), [text, settled])
  const search = useSemanticSearch(params, text !== '')

  // Derived from the latest result and the toggle, so set during render (guarded) rather than in an effect.
  const reason = search.isError ? stepAsideMessage(search.error) : null
  if (reason !== null && reason !== pausedFor) setPausedFor(reason)
  if (!enabled && pausedFor !== null) setPausedFor(null)

  return {
    statusQuery,
    active: usable && text !== '' ? ({ status: usable, search } satisfies ActiveSmartSearch) : null,
    pausedFor,
    resume: () => setPausedFor(null),
  }
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      resolve()
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** Refresh status and results, unless the session that started the write has ended. */
function refreshSemanticSearch(queryClient: QueryClient, signal: AbortSignal | undefined) {
  if (!signal || !isCurrentSession(signal)) return
  void queryClient.invalidateQueries({ queryKey: SEMANTIC_SEARCH_KEY })
  // Indexing is metered too.
  void queryClient.invalidateQueries({ queryKey: AI_USAGE_KEY })
}

/**
 * One loop per tab. It outlives the card that started it (the mutation keeps
 * running while the user turns Smart search off or leaves the page), so the
 * stop flag and the running check are tab-wide rather than per component.
 */
let stopRequested = false

/**
 * Builds or updates the index one batch per request until the server reports
 * done, a batch makes no progress, or `stop()` is called. Each batch's counts
 * are written into the status query so the progress bar moves with it.
 * Errors stay on the mutation for the panel to show, not in a toast.
 */
export function useBuildSemanticIndex() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()
  const running = useIsMutating({ mutationKey: INDEX_KEY }) > 0

  const mutation = useMutation({
    mutationKey: [...INDEX_KEY, getSessionGeneration()],
    mutationFn: async (): Promise<SemanticIndexBatch | null> => {
      stopRequested = false
      let last: SemanticIndexBatch | null = null
      while (!stopRequested) {
        assertCurrentSession(sessionSignal)
        const started = Date.now()
        const batch = await semanticSearchService.indexBatch()
        if (!isCurrentSession(sessionSignal)) return null
        last = batch
        queryClient.setQueryData<SemanticSearchStatus>(STATUS_KEY, (status) =>
          status && { ...status, total: batch.total, indexed: batch.indexed, pending: batch.pending })
        if (batch.done || batch.embedded === 0) break
        await pause(MIN_BATCH_INTERVAL_MS - (Date.now() - started), sessionSignal)
      }
      return last
    },
    onMutate: () => sessionSignal,
    onSuccess: (_batch, _input, signal) => refreshSemanticSearch(queryClient, signal),
    onError: (_error, _input, signal) => refreshSemanticSearch(queryClient, signal),
  })

  return {
    ...mutation,
    /** True while any indexing loop in this tab runs, including one a closed card started. */
    running,
    /** Finish the batch in flight, then stop; pending rows stay pending. */
    stop: () => {
      stopRequested = true
    },
  }
}

export function useDeleteSemanticIndex() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...SEMANTIC_SEARCH_KEY, 'delete', getSessionGeneration()],
    mutationFn: () => {
      assertCurrentSession(sessionSignal)
      return semanticSearchService.deleteIndex()
    },
    onMutate: () => sessionSignal,
    onSuccess: (_deleted, _input, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      queryClient.removeQueries({ queryKey: RESULTS_KEY })
      refreshSemanticSearch(queryClient, signal)
    },
  })
}
