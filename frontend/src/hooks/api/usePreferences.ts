/**
 * React Query hooks for user preferences
 */

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  preferencesService,
  type UserPreferences,
  type UserPreferencesUpdate,
  type AnomalySettingsConfig,
  type CapitalLossConfig,
} from '@/services/api/preferences'
import { usePreferencesStore } from '@/store/preferencesStore'
import { useAuthStore } from '@/store/authStore'
import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'

export const PREFERENCES_KEY = ['preferences'] as const

const PREFERENCE_DEPENDENTS = new Set([
  'analytics',
  'analyticsV2',
  'transactions',
  'transactions-page',
  'transaction-facets',
  'command-palette-search',
  'calculations',
  'kpis',
  'account-classifications',
  'income-analysis',
  'category-monthly-history',
  'category-daily-series',
  'categorization-rules',
  'earning-start-evidence',
])

/**
 * The full-ledger family (`['transactions', ...]`, ~2.9 MB for `/transactions/all`).
 * Of all preferences, only `excluded_accounts` changes what those endpoints
 * return (`_base_transaction_query` in backend `api/transactions.py`), so a
 * save that leaves it untouched must not force the whole ledger to re-download.
 */
const LEDGER_KEY = 'transactions'

/**
 * Mark every affected family stale, including inactive pages and filter variants.
 *
 * `includeLedger` defaults to true because callers such as rule application
 * rewrite transaction categories; pass false only when the write provably
 * cannot change ledger rows (no `excluded_accounts` change).
 */
export function invalidatePreferenceDependents(
  client: QueryClient,
  includePreferences = true,
  includeLedger = true,
) {
  return client.invalidateQueries({
    predicate: ({ queryKey }) =>
      typeof queryKey[0] === 'string' &&
      ((PREFERENCE_DEPENDENTS.has(queryKey[0]) && (includeLedger || queryKey[0] !== LEDGER_KEY)) ||
        (includePreferences && queryKey[0] === 'preferences')),
  })
}

async function cachePreferences(client: QueryClient, data: UserPreferences, signal: AbortSignal) {
  await client.cancelQueries({ queryKey: PREFERENCES_KEY })
  assertCurrentSession(signal)
  client.setQueryData(PREFERENCES_KEY, data)
  usePreferencesStore.getState().hydrateFromApi(data)
}

/** Re-read only after the whole settings save has completed. */
export async function refreshPreferences(client: QueryClient, signal: AbortSignal) {
  await client.cancelQueries({ queryKey: PREFERENCES_KEY })
  assertCurrentSession(signal)
  const data = await client.fetchQuery({
    queryKey: PREFERENCES_KEY,
    queryFn: () => preferencesService.getPreferences(),
    staleTime: 0,
  })
  assertCurrentSession(signal)
  usePreferencesStore.getState().hydrateFromApi(data)
  return data
}

/**
 * Fetch user preferences and hydrate the store
 */
export function usePreferences() {
  const queryClient = useQueryClient()
  const hydrateFromApi = usePreferencesStore((state) => state.hydrateFromApi)
  const accessToken = useAuthStore((state) => state.accessToken)
  const isLoading = useAuthStore((state) => state.isLoading)
  const sessionSignal = getSessionSignal()

  const query = useQuery<UserPreferences>({
    queryKey: PREFERENCES_KEY,
    queryFn: () => preferencesService.getPreferences(),
    // Wait for useAuthInit to finish verifying the token before fetching.
    // Without `!isLoading`, a stale token from localStorage triggers a 401.
    enabled: !!accessToken && !isLoading,
    // Preferences only change on explicit save (mutations invalidate this key).
    staleTime: Infinity,
  })

  // Hydrate the store when preferences load
  useEffect(() => {
    if (
      query.data &&
      isCurrentSession(sessionSignal) &&
      queryClient.getQueryData(PREFERENCES_KEY) === query.data
    ) {
      hydrateFromApi(query.data)
    }
  }, [query.data, hydrateFromApi, queryClient, sessionSignal])

  return query
}

/**
 * Update preferences (partial update)
 */
function usePreferenceMutation<T>(
  save: (config: T) => Promise<UserPreferences>,
  /** Whether this write can change the ledger rows (see `LEDGER_KEY`). */
  touchesLedger: (config: T) => boolean,
) {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: ['preferences', getSessionGeneration()],
    mutationFn: (config: T) => {
      assertCurrentSession(sessionSignal)
      return save(config)
    },
    onMutate: () => sessionSignal,
    onSuccess: async (data, variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      await cachePreferences(queryClient, data, signal)
      void invalidatePreferenceDependents(queryClient, false, touchesLedger(variables))
    },
  })
}

export function useUpdatePreferences() {
  return usePreferenceMutation<UserPreferencesUpdate>(
    (updates) => preferencesService.updatePreferences(updates),
    (updates) => 'excluded_accounts' in updates,
  )
}

/**
 * Reset preferences to defaults
 */
export function useResetPreferences() {
  // A reset may clear excluded_accounts, so the ledger is always refreshed.
  return usePreferenceMutation<void>(() => preferencesService.resetPreferences(), () => true)
}

export function useUpdateAnomalySettings() {
  return usePreferenceMutation<AnomalySettingsConfig>(preferencesService.updateAnomalySettings, () => false)
}

/**
 * Replace the classified realised-loss set.
 *
 * Session-safe through `usePreferenceMutation`: the captured session is
 * asserted before dispatch and checked again before the response is cached,
 * and success invalidates every preference dependent (`analyticsV2` covers the
 * Data Health candidates, `calculations` the totals). The ledger rows
 * themselves do not change, so the full ledger is not re-downloaded; pages that
 * aggregate it client-side re-read `capital_loss_categories` off the refreshed
 * preferences (`capitalLossConfig` in `lib/expenseClassification`).
 */
export function useUpdateCapitalLossCategories() {
  return usePreferenceMutation<CapitalLossConfig>(preferencesService.updateCapitalLossCategories, () => false)
}
