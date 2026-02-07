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
} from '@/services/api/preferences'
import { usePreferencesStore } from '@/store/preferencesStore'

const PREFERENCES_KEY = ['preferences']

/**
 * Fetch user preferences and hydrate the store
 */
export function usePreferences() {
  const hydrateFromApi = usePreferencesStore((state) => state.hydrateFromApi)

  const query = useQuery<UserPreferences>({
    queryKey: PREFERENCES_KEY,
    queryFn: () => preferencesService.getPreferences(),
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
      queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY })
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
      queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY })
      hydrateFromApi(data)
    },
  })
}

// Section-specific mutations
export function useUpdateFiscalYear() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: FiscalYearConfig) => preferencesService.updateFiscalYear(config),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY }),
  })
}

export function useUpdateEssentialCategories() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: EssentialCategoriesConfig) => preferencesService.updateEssentialCategories(config),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY }),
  })
}

export function useUpdateInvestmentMappings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: InvestmentMappingsConfig) => preferencesService.updateInvestmentMappings(config),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY }),
  })
}

export function useUpdateIncomeSources() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: IncomeSourcesConfig) => preferencesService.updateIncomeSources(config),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY }),
  })
}

export function useUpdateBudgetDefaults() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: BudgetDefaultsConfig) => preferencesService.updateBudgetDefaults(config),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY }),
  })
}

export function useUpdateDisplayPreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: DisplayPreferencesConfig) => preferencesService.updateDisplayPreferences(config),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY }),
  })
}

export function useUpdateAnomalySettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: AnomalySettingsConfig) => preferencesService.updateAnomalySettings(config),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY }),
  })
}

export function useUpdateRecurringSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: RecurringSettingsConfig) => preferencesService.updateRecurringSettings(config),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY }),
  })
}
