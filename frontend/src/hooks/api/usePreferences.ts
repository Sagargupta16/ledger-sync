/**
 * React Query hooks for user preferences
 */

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  preferencesService,
  type UserPreferences,
  type UserPreferencesUpdate,
  type FiscalYearConfig,
  type EssentialCategoriesConfig,
  type InvestmentMappingsConfig,
  type IncomeSourcesConfig,
  type BudgetDefaultsConfig,
  type DisplayPreferencesConfig,
  type AnomalySettingsConfig,
  type RecurringSettingsConfig,
  type SalaryStructureConfig,
  type RsuGrantsConfig,
  type GrowthAssumptionsConfig,
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
])

/** Mark every affected family stale, including inactive pages and filter variants. */
export function invalidatePreferenceDependents(client: QueryClient, includePreferences = true) {
  return client.invalidateQueries({
    predicate: ({ queryKey }) =>
      typeof queryKey[0] === 'string' &&
      (PREFERENCE_DEPENDENTS.has(queryKey[0]) || (includePreferences && queryKey[0] === 'preferences')),
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
function usePreferenceMutation<T>(save: (config: T) => Promise<UserPreferences>) {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: ['preferences', getSessionGeneration()],
    mutationFn: (config: T) => {
      assertCurrentSession(sessionSignal)
      return save(config)
    },
    onMutate: () => sessionSignal,
    onSuccess: async (data, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      await cachePreferences(queryClient, data, signal)
      void invalidatePreferenceDependents(queryClient, false)
    },
  })
}

export function useUpdatePreferences() {
  return usePreferenceMutation<UserPreferencesUpdate>((updates) => preferencesService.updatePreferences(updates))
}

/**
 * Reset preferences to defaults
 */
export function useResetPreferences() {
  return usePreferenceMutation<void>(() => preferencesService.resetPreferences())
}

// Section-specific mutations share cache publication and invalidation.
export function useUpdateFiscalYear() {
  return usePreferenceMutation<FiscalYearConfig>(preferencesService.updateFiscalYear)
}

export function useUpdateEssentialCategories() {
  return usePreferenceMutation<EssentialCategoriesConfig>(preferencesService.updateEssentialCategories)
}

export function useUpdateInvestmentMappings() {
  return usePreferenceMutation<InvestmentMappingsConfig>(preferencesService.updateInvestmentMappings)
}

export function useUpdateIncomeSources() {
  return usePreferenceMutation<IncomeSourcesConfig>(preferencesService.updateIncomeSources)
}

export function useUpdateBudgetDefaults() {
  return usePreferenceMutation<BudgetDefaultsConfig>(preferencesService.updateBudgetDefaults)
}

export function useUpdateDisplayPreferences() {
  return usePreferenceMutation<DisplayPreferencesConfig>(preferencesService.updateDisplayPreferences)
}

export function useUpdateAnomalySettings() {
  return usePreferenceMutation<AnomalySettingsConfig>(preferencesService.updateAnomalySettings)
}

export function useUpdateRecurringSettings() {
  return usePreferenceMutation<RecurringSettingsConfig>(preferencesService.updateRecurringSettings)
}

export function useUpdateSalaryStructure() {
  return usePreferenceMutation<SalaryStructureConfig>(preferencesService.updateSalaryStructure)
}

export function useUpdateRsuGrants() {
  return usePreferenceMutation<RsuGrantsConfig>(preferencesService.updateRsuGrants)
}

export function useUpdateGrowthAssumptions() {
  return usePreferenceMutation<GrowthAssumptionsConfig>(preferencesService.updateGrowthAssumptions)
}
