/**
 * React Query hooks for user preferences
 */

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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

const PREFERENCES_KEY = ['preferences']

/** Invalidate preferences and all downstream queries that depend on them */
function invalidatePreferenceDependents(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY })
  queryClient.invalidateQueries({ queryKey: ['analytics'] })
  queryClient.invalidateQueries({ queryKey: ['analyticsV2'] })
  queryClient.invalidateQueries({ queryKey: ['transactions'] })
  queryClient.invalidateQueries({ queryKey: ['calculations'] })
  queryClient.invalidateQueries({ queryKey: ['kpis'] })
}

/**
 * Fetch user preferences and hydrate the store
 */
export function usePreferences() {
  const hydrateFromApi = usePreferencesStore((state) => state.hydrateFromApi)
  const accessToken = useAuthStore((state) => state.accessToken)

  const query = useQuery<UserPreferences>({
    queryKey: PREFERENCES_KEY,
    queryFn: () => preferencesService.getPreferences(),
    // Only fetch when the user is authenticated (prevents 401 before login)
    enabled: !!accessToken,
    // Preferences only change on explicit save (mutations invalidate this key).
    staleTime: Infinity,
  })

  // Hydrate the store when preferences load
  useEffect(() => {
    if (query.data) {
      hydrateFromApi(query.data)
    }
  }, [query.data, hydrateFromApi])

  return query
}

/**
 * Update preferences (partial update)
 */
export function useUpdatePreferences() {
  const queryClient = useQueryClient()
  const hydrateFromApi = usePreferencesStore((state) => state.hydrateFromApi)

  return useMutation({
    mutationFn: (updates: UserPreferencesUpdate) => preferencesService.updatePreferences(updates),
    onSuccess: (data) => {
      invalidatePreferenceDependents(queryClient)
      hydrateFromApi(data)
    },
  })
}

/**
 * Reset preferences to defaults
 */
export function useResetPreferences() {
  const queryClient = useQueryClient()
  const hydrateFromApi = usePreferencesStore((state) => state.hydrateFromApi)

  return useMutation({
    mutationFn: () => preferencesService.resetPreferences(),
    onSuccess: (data) => {
      invalidatePreferenceDependents(queryClient)
      hydrateFromApi(data)
    },
  })
}

// Section-specific mutations — each cascades to dependent queries
export function useUpdateFiscalYear() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: FiscalYearConfig) => preferencesService.updateFiscalYear(config),
    onSuccess: () => invalidatePreferenceDependents(queryClient),
  })
}

export function useUpdateEssentialCategories() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: EssentialCategoriesConfig) => preferencesService.updateEssentialCategories(config),
    onSuccess: () => invalidatePreferenceDependents(queryClient),
  })
}

export function useUpdateInvestmentMappings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: InvestmentMappingsConfig) => preferencesService.updateInvestmentMappings(config),
    onSuccess: () => invalidatePreferenceDependents(queryClient),
  })
}

export function useUpdateIncomeSources() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: IncomeSourcesConfig) => preferencesService.updateIncomeSources(config),
    onSuccess: () => invalidatePreferenceDependents(queryClient),
  })
}

export function useUpdateBudgetDefaults() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: BudgetDefaultsConfig) => preferencesService.updateBudgetDefaults(config),
    onSuccess: () => invalidatePreferenceDependents(queryClient),
  })
}

export function useUpdateDisplayPreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: DisplayPreferencesConfig) => preferencesService.updateDisplayPreferences(config),
    onSuccess: () => invalidatePreferenceDependents(queryClient),
  })
}

export function useUpdateAnomalySettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: AnomalySettingsConfig) => preferencesService.updateAnomalySettings(config),
    onSuccess: () => invalidatePreferenceDependents(queryClient),
  })
}

export function useUpdateRecurringSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: RecurringSettingsConfig) => preferencesService.updateRecurringSettings(config),
    onSuccess: () => invalidatePreferenceDependents(queryClient),
  })
}

export function useUpdateSalaryStructure() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: SalaryStructureConfig) =>
      preferencesService.updateSalaryStructure(config),
    onSuccess: () => invalidatePreferenceDependents(queryClient),
  })
}

export function useUpdateRsuGrants() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: RsuGrantsConfig) =>
      preferencesService.updateRsuGrants(config),
    onSuccess: () => invalidatePreferenceDependents(queryClient),
  })
}

export function useUpdateGrowthAssumptions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: GrowthAssumptionsConfig) =>
      preferencesService.updateGrowthAssumptions(config),
    onSuccess: () => invalidatePreferenceDependents(queryClient),
  })
}
