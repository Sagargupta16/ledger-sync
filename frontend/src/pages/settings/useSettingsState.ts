/**
 * Custom hook encapsulating all Settings page state, derived data, and effects.
 *
 * The editable draft lives in `useSettingsDraft` (seeded from the server by
 * `useSeedSettingsDraft`), derived lists in `useSettingsDerived`, and the
 * save's write steps in `settingsSaveWrites`.
 */

import { useState, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccountBalances, useIncomeFacets, useMasterCategories } from '@/hooks/api/useAnalytics'
import { useAccountClassifications } from '@/hooks/api/useAccountClassifications'
import { useClosedAccounts } from '@/hooks/api/useAccountStatus'
import { categorizationRulesService } from '@/services/api/categorizationRules'
import { preferencesService } from '@/services/api/preferences'
import {
  usePreferences, useResetPreferences, invalidatePreferenceDependents, refreshPreferences,
} from '@/hooks/api/usePreferences'
import { toast } from 'sonner'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import { DEFAULT_GROWTH_ASSUMPTIONS } from '@/types/salary'
import { sortVestings } from '@/lib/rsuVesting'
import { assertCurrentSession, getSessionSignal, isCurrentSession } from '@/lib/session'
import { getApiErrorMessage } from '@/lib/errorUtils'
import type { LocalPrefs } from './types'
import { INCOME_CLASSIFICATION_KEY_MAP } from './types'
import { buildInitialLocalPrefs } from './helpers'
import {
  excludedAccountsChanged, syncCategorizationRules, toLocalRules, writeChangedClassifications,
} from './settingsSaveWrites'
import { useSettingsDerived } from './useSettingsDerived'
import { useSettingsDraft } from './useSettingsDraft'
import { useSeedSettingsDraft } from './useSeedSettingsDraft'

const RULES_KEY = ['categorization-rules'] as const

export function useSettingsState() {
  // Data hooks
  const {
    data: preferences,
    isLoading: preferencesLoading,
    isError: preferencesError,
    refetch: refetchPreferences,
  } = usePreferences()
  const resetPreferences = useResetPreferences()
  const classificationsQuery = useAccountClassifications()
  const rulesQuery = useQuery({
    queryKey: RULES_KEY,
    queryFn: () => categorizationRulesService.getRules(),
    staleTime: Infinity,
  })
  const {
    data: masterCategories,
    isLoading: categoriesLoading,
    isError: categoriesError,
    refetch: refetchCategories,
  } = useMasterCategories()
  const {
    data: balanceData,
    isLoading: balancesLoading,
    isError: balancesError,
    refetch: refetchBalances,
  } = useAccountBalances()
  const {
    data: closedAccounts = [],
    isLoading: closedAccountsLoading,
    isError: closedAccountsError,
    refetch: refetchClosedAccounts,
  } = useClosedAccounts()
  const {
    data: incomeFacetsData,
    isLoading: incomeFacetsLoading,
    isError: incomeFacetsError,
    refetch: refetchIncomeFacets,
  } = useIncomeFacets()
  const { guardDemoAction } = useDemoGuard()

  // Local state
  const draft = useSettingsDraft()
  const {
    classifications, localPrefs, setLocalPrefs, setHasChanges,
    localSalaryStructure, setLocalSalaryStructure, localRsuGrants, setLocalRsuGrants,
    localGrowthAssumptions, setLocalGrowthAssumptions, rules, setRules,
  } = draft
  const saveInProgress = useRef(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [applyingRules, setApplyingRules] = useState(false)
  const queryClient = useQueryClient()

  // Derived data
  const derived = useSettingsDerived({
    balanceData, masterCategories, incomeFacetsData, classifications, localPrefs,
  })
  const { accounts, allIncomeCategories, investmentAccounts, incomeAudit } = derived

  useSeedSettingsDraft({
    draft,
    preferences,
    balanceData,
    classificationsData: classificationsQuery.data,
    rulesData: rulesQuery.data,
    accounts,
    allIncomeCategories,
    investmentAccounts,
    isSaving,
  })

  const retrySettings = useCallback(async () => {
    await Promise.all([
      refetchPreferences(),
      refetchCategories(),
      refetchBalances(),
      refetchClosedAccounts(),
      refetchIncomeFacets(),
      classificationsQuery.refetch(),
      rulesQuery.refetch(),
    ])
  }, [refetchPreferences, refetchCategories, refetchBalances, refetchClosedAccounts, refetchIncomeFacets, classificationsQuery, rulesQuery])

  const handleApplyRules = useCallback(async () => {
    if (saveInProgress.current || applyingRules) return
    if (guardDemoAction('Applying rules')) return
    const signal = getSessionSignal()
    setApplyingRules(true)
    try {
      const res = await categorizationRulesService.applyRules()
      assertCurrentSession(signal)
      toast.success(`Updated ${res.updated} of ${res.matched} matching transactions`)
      void invalidatePreferenceDependents(queryClient, false)
    } catch {
      if (isCurrentSession(signal)) toast.error('Failed to apply rules')
    } finally {
      setApplyingRules(false)
    }
  }, [guardDemoAction, queryClient, applyingRules])

  /**
   * Apply every keyword suggestion the audit produced in one go.
   *
   * The first-run auto-classify effect above deliberately bails out once any
   * list is non-empty (a configured list stays authoritative -- the backend
   * honours it verbatim). This is the explicit, user-driven equivalent: it only
   * ever ADDS buckets no list claims, so nothing already classified moves.
   * Buckets with no keyword match (`suggested: null`) are left alone -- the
   * user picks those from the per-row dropdown.
   */
  const applyIncomeSuggestions = useCallback(() => {
    const suggestions = incomeAudit.unclassified.filter((item) => item.suggested !== null)
    if (suggestions.length === 0) return
    setLocalPrefs((prev) => {
      if (!prev) return prev
      const next = { ...prev }
      for (const item of suggestions) {
        if (!item.suggested) continue
        const key = INCOME_CLASSIFICATION_KEY_MAP[item.suggested]
        next[key] = [...next[key], item.key]
      }
      return next
    })
    setHasChanges(true)
  }, [incomeAudit, setLocalPrefs, setHasChanges])

  // Save / Reset
  const handleSave = useCallback(async () => {
    if (!localPrefs || saveInProgress.current || applyingRules) return
    if (guardDemoAction('Saving settings')) return
    const hasIncompleteRule = rules.some((rule) => !rule.pattern.trim() || !rule.category.trim())
    if (hasIncompleteRule) {
      setSaveError('Add a pattern and category to every rule, or remove the unfinished rule.')
      return
    }

    const signal = getSessionSignal()
    // Only an excluded-accounts change alters the ledger rows, so only then is
    // the ~2.9 MB full ledger worth re-downloading after the save.
    const touchesLedger = excludedAccountsChanged(localPrefs.excluded_accounts, preferences?.excluded_accounts)
    saveInProgress.current = true
    setIsSaving(true)
    setSaveError(null)
    setSavedAt(null)
    try {
      await writeChangedClassifications(classifications, signal)
      // The existing endpoint accepts all of these fields in one transaction.
      // Publish to the cache only after classifications and rules also settle.
      await preferencesService.updatePreferences({
        ...localPrefs,
        salary_structure: localSalaryStructure,
        rsu_grants: localRsuGrants,
        growth_assumptions: localGrowthAssumptions,
      })
      assertCurrentSession(signal)

      await syncCategorizationRules(rules, signal, setRules)
      const [savedPreferences, refreshed] = await Promise.all([
        refreshPreferences(queryClient, signal),
        categorizationRulesService.getRules(),
      ])
      assertCurrentSession(signal)
      queryClient.setQueryData(RULES_KEY, refreshed)
      queryClient.setQueryData(['account-classifications', 'all'], classifications)
      setLocalPrefs(buildInitialLocalPrefs(savedPreferences as unknown as Record<string, unknown>) as unknown as LocalPrefs)
      setLocalSalaryStructure(savedPreferences.salary_structure)
      setLocalRsuGrants(savedPreferences.rsu_grants.map((grant) => ({
        ...grant, vestings: sortVestings(grant.vestings),
      })))
      setLocalGrowthAssumptions({ ...DEFAULT_GROWTH_ASSUMPTIONS, ...savedPreferences.growth_assumptions })
      setRules(toLocalRules(refreshed))

      setHasChanges(false)
      setSavedAt(new Date())
      toast.success('Settings saved')
    } catch (error) {
      if (isCurrentSession(signal)) {
        setHasChanges(true)
        setSaveError(`${getApiErrorMessage(error)} Your edits are kept here. Retry to finish saving.`)
        toast.error('Settings could not be fully saved')
      }
    } finally {
      if (isCurrentSession(signal)) {
        // Some writes may have succeeded even on failure. Refresh readers
        // without replacing the editable draft.
        void invalidatePreferenceDependents(queryClient, true, touchesLedger)
        // Earning-start evidence is income rows per day, so excluding an
        // account can move it; its key sits outside the dependents list.
        if (touchesLedger) void queryClient.invalidateQueries({ queryKey: ['earning-start-evidence'] })
      }
      saveInProgress.current = false
      setIsSaving(false)
    }
  }, [classifications, localPrefs, preferences?.excluded_accounts, guardDemoAction, localSalaryStructure, localRsuGrants, localGrowthAssumptions, rules, queryClient, applyingRules, setLocalPrefs, setLocalSalaryStructure, setLocalRsuGrants, setLocalGrowthAssumptions, setRules, setHasChanges])

  const handleReset = useCallback(async () => {
    if (saveInProgress.current || applyingRules) return
    if (guardDemoAction('Resetting settings')) return
    const signal = getSessionSignal()
    saveInProgress.current = true
    setIsResetting(true)
    setSaveError(null)
    try {
      await resetPreferences.mutateAsync()
      assertCurrentSession(signal)
      setLocalPrefs(null)
      setHasChanges(false)
      setSavedAt(new Date())
      toast.success('Settings reset to defaults')
    } catch {
      if (isCurrentSession(signal)) {
        setSaveError('Could not reset settings. Your current edits are kept here.')
        toast.error('Failed to reset settings')
      }
    } finally {
      saveInProgress.current = false
      setIsResetting(false)
    }
  }, [resetPreferences, guardDemoAction, applyingRules, setLocalPrefs, setHasChanges])

  const isLoading =
    preferencesLoading ||
    classificationsQuery.isLoading ||
    categoriesLoading ||
    balancesLoading ||
    closedAccountsLoading ||
    incomeFacetsLoading ||
    rulesQuery.isLoading
  const loadError =
    (preferencesError && !preferences) ||
    (categoriesError && !masterCategories) ||
    (balancesError && !balanceData) ||
    (closedAccountsError && closedAccounts.length === 0 && !localPrefs) ||
    (incomeFacetsError && !incomeFacetsData) ||
    (classificationsQuery.isError && !classificationsQuery.data) ||
    (rulesQuery.isError && !rulesQuery.data)

  return {
    ...draft,
    ...derived,
    isLoading, loadError, retrySettings, balancesLoading, balanceData, closedAccounts,
    isSaving, isResetting, saveError, savedAt,
    applyIncomeSuggestions, handleSave, handleReset, handleApplyRules, applyingRules,
  }
}
