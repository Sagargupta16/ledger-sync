/**
 * Custom hook encapsulating all Settings page state, derived data, and effects.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccountBalances, useIncomeFacets, useMasterCategories } from '@/hooks/api/useAnalytics'
import { useAccountClassifications } from '@/hooks/api/useAccountClassifications'
import { useClosedAccounts } from '@/hooks/api/useAccountStatus'
import { accountClassificationsService } from '@/services/api/accountClassifications'
import { categorizationRulesService, type CategorizationRuleInput } from '@/services/api/categorizationRules'
import { preferencesService } from '@/services/api/preferences'
import {
  usePreferences, useResetPreferences, invalidatePreferenceDependents, refreshPreferences,
} from '@/hooks/api/usePreferences'
import { toast } from 'sonner'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import type { SalaryComponents, RsuGrant, GrowthAssumptions } from '@/types/salary'
import { DEFAULT_GROWTH_ASSUMPTIONS } from '@/types/salary'
import { sortVestings } from '@/lib/rsuVesting'
import { assertCurrentSession, getSessionSignal, isCurrentSession } from '@/lib/session'
import { getApiErrorMessage } from '@/lib/errorUtils'
import type { LocalPrefs, LocalPrefKey, LocalRule } from './types'
import { ACCOUNT_TYPES, INCOME_CLASSIFICATION_KEY_MAP } from './types'
import type { IncomeFacet } from './helpers'
import {
  auditIncomeClassification, getDefaultClassifications, getDefaultIncomeClassifications, getDefaultInvestmentMappings, normalizeArray, getStoredWidgets, buildInitialLocalPrefs,
} from './helpers'

const RULES_KEY = ['categorization-rules'] as const

async function settleWrites(writes: Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(writes)
  const failure = results.find((result) => result.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
}

function createdRuleIdUpdater(localId: string, id: number) {
  return (current: LocalRule[]) => current.map((item) =>
    item.localId === localId ? { ...item, id } : item,
  )
}

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
  const [classifications, setClassifications] = useState<Record<string, string>>({})
  const classificationsInitialized = useRef(false)
  const rulesInitialized = useRef(false)
  const saveInProgress = useRef(false)
  const [localPrefs, setLocalPrefs] = useState<LocalPrefs | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragType, setDragType] = useState<'account' | null>(null)
  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(getStoredWidgets)
  const [localSalaryStructure, setLocalSalaryStructure] = useState<Record<string, SalaryComponents>>({})
  const [localRsuGrants, setLocalRsuGrants] = useState<RsuGrant[]>([])
  const [localGrowthAssumptions, setLocalGrowthAssumptions] = useState<GrowthAssumptions>({ ...DEFAULT_GROWTH_ASSUMPTIONS })
  const [rules, setRules] = useState<LocalRule[]>([])
  const [applyingRules, setApplyingRules] = useState(false)
  const queryClient = useQueryClient()

  // Derived data
  const accounts = useMemo(() => {
    const acc = balanceData?.accounts ?? {}
    return Object.keys(acc)
      .filter((name) => acc[name].balance !== 0)
      .sort((a, b) => a.localeCompare(b))
  }, [balanceData])

  const allExpenseCategories = useMemo(() => {
    if (!masterCategories?.expense) return []
    return Object.keys(masterCategories.expense)
      .filter((cat) => !cat.toLowerCase().startsWith('transfer'))
      .sort((a, b) => a.localeCompare(b))
  }, [masterCategories])

  const allIncomeCategories = useMemo(() => {
    if (!masterCategories?.income) return {}
    return masterCategories.income
  }, [masterCategories])

  const investmentAccounts = useMemo(
    () => accounts.filter((acc) => classifications[acc] === 'Investments'),
    [accounts, classifications],
  )

  const creditCardAccounts = useMemo(
    () => accounts.filter((acc) => classifications[acc] === 'Credit Cards'),
    [accounts, classifications],
  )

  const accountsByCategory = useMemo(
    () =>
      ACCOUNT_TYPES.reduce(
        (acc, category) => {
          acc[category] = accounts.filter((name) => classifications[name] === category)
          return acc
        },
        {} as Record<string, string[]>,
      ),
    [accounts, classifications],
  )

  const unclassifiedAccounts = useMemo(() => {
    const classified = new Set(Object.values(accountsByCategory).flat())
    return accounts.filter((name) => !classified.has(name))
  }, [accounts, accountsByCategory])

  const excludedAccounts = useMemo(
    () => (localPrefs ? normalizeArray(localPrefs.excluded_accounts) : []),
    [localPrefs],
  )

  const fixedCategories = useMemo(
    () => (localPrefs ? normalizeArray(localPrefs.fixed_expense_categories) : []),
    [localPrefs],
  )

  /**
   * Every income bucket the user has, with its money impact.
   *
   * `/income-facets` carries the counts and sums but applies the
   * excluded-accounts filter, while the section's own list is built from
   * `/categories/master` (which does not). Anything in the list without a
   * facet is added at zero so the audit covers exactly the rows the user can
   * see, and so an excluded-account-only bucket is not mistaken for a dead
   * (drifted-spelling) key.
   */
  const incomeFacets = useMemo<IncomeFacet[]>(() => {
    const facets = incomeFacetsData?.facets ?? []
    const seen = new Set(facets.map((f) => `${f.category}::${f.subcategory}`.toLowerCase()))
    const padded: IncomeFacet[] = facets.map((f) => ({
      category: f.category,
      subcategory: f.subcategory,
      count: f.count,
      total: f.total,
    }))
    for (const [category, subs] of Object.entries(allIncomeCategories)) {
      for (const subcategory of subs) {
        if (seen.has(`${category}::${subcategory}`.toLowerCase())) continue
        padded.push({ category, subcategory, count: 0, total: 0 })
      }
    }
    return padded
  }, [incomeFacetsData, allIncomeCategories])

  /**
   * Reconciles the four saved classification lists against those buckets.
   * Replaces the old name-only "unclassified" count, which could not say how
   * much money was sitting outside every bucket and never surfaced saved keys
   * that match nothing.
   */
  const incomeAudit = useMemo(
    () =>
      auditIncomeClassification(
        incomeFacets,
        localPrefs
          ? {
              taxable: localPrefs.taxable_income_categories,
              investment: localPrefs.investment_returns_categories,
              non_taxable: localPrefs.non_taxable_income_categories,
              other: localPrefs.other_income_categories,
            }
          : { taxable: [], investment: [], non_taxable: [], other: [] },
      ),
    [incomeFacets, localPrefs],
  )

  const unmappedInvestmentAccounts = useMemo(
    () =>
      localPrefs
        ? investmentAccounts.filter((acc) => !localPrefs.investment_account_mappings[acc])
        : [],
    [investmentAccounts, localPrefs],
  )

  // Initialize local prefs from server data
  useEffect(() => {
    if (!preferences || localPrefs) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeding editable local copy from server preferences once
    setLocalPrefs(buildInitialLocalPrefs(preferences as unknown as Record<string, unknown>) as unknown as LocalPrefs)
    if (preferences.salary_structure) setLocalSalaryStructure(preferences.salary_structure)
    if (preferences.rsu_grants) {
      // Grants saved before vesting sort-on-blur existed may hold rows in
      // insertion order; normalize chronologically on load.
      setLocalRsuGrants(
        preferences.rsu_grants.map((g) => ({ ...g, vestings: sortVestings(g.vestings) })),
      )
    }
    if (preferences.growth_assumptions) {
      setLocalGrowthAssumptions({ ...DEFAULT_GROWTH_ASSUMPTIONS, ...preferences.growth_assumptions })
    }
  }, [preferences, localPrefs])

  // Auto-classify unclassified income categories using keyword matching
  useEffect(() => {
    if (!localPrefs || Object.keys(allIncomeCategories).length === 0) return
    const hasAny = localPrefs.taxable_income_categories.length > 0 ||
      localPrefs.investment_returns_categories.length > 0 ||
      localPrefs.non_taxable_income_categories.length > 0 ||
      localPrefs.other_income_categories.length > 0
    if (hasAny) return

    const defaults = getDefaultIncomeClassifications(
      allIncomeCategories,
      { taxable: [], investment: [], non_taxable: [], other: [] },
    )
    if (defaults.taxable.length + defaults.investment.length + defaults.non_taxable.length + defaults.other.length === 0) return

    // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-classifying income categories from server data when none set
    setLocalPrefs((prev) => prev ? {
      ...prev,
      taxable_income_categories: defaults.taxable,
      investment_returns_categories: defaults.investment,
      non_taxable_income_categories: defaults.non_taxable,
      other_income_categories: defaults.other,
    } : prev)
    setHasChanges(true)
  }, [localPrefs, allIncomeCategories])

  // Auto-map unmapped investment accounts using keyword matching
  useEffect(() => {
    if (!localPrefs || investmentAccounts.length === 0) return
    const unmapped = investmentAccounts.filter((acc) => !localPrefs.investment_account_mappings[acc])
    if (unmapped.length === 0) return

    const defaults = getDefaultInvestmentMappings(unmapped)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-mapping investment accounts from server data when none set
    setLocalPrefs((prev) => prev ? {
      ...prev,
      investment_account_mappings: { ...prev.investment_account_mappings, ...defaults },
    } : prev)
    setHasChanges(true)
  }, [localPrefs, investmentAccounts])

  // Keep editable copies when a background refetch arrives during an edit.
  useEffect(() => {
    if (!classificationsQuery.data || !balanceData) return
    if (classificationsInitialized.current && (hasChanges || isSaving)) return
    classificationsInitialized.current = true
    const accountStats = balanceData.accounts as
      | Record<string, { balance: number; transactions: number }>
      | undefined
    setClassifications({
      ...getDefaultClassifications(accounts, accountStats),
      ...classificationsQuery.data,
    })
  }, [classificationsQuery.data, accounts, balanceData, hasChanges, isSaving])

  useEffect(() => {
    if (!rulesQuery.data) return
    if (rulesInitialized.current && (hasChanges || isSaving)) return
    rulesInitialized.current = true
    setRules(rulesQuery.data.map((rule) => ({ ...rule, localId: String(rule.id) })))
  }, [rulesQuery.data, hasChanges, isSaving])

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

  // Categorization rule handlers
  const addRule = useCallback(() => {
    setRules((prev) => [
      ...prev,
      {
        localId: crypto.randomUUID(),
        match_field: 'note',
        pattern: '',
        category: '',
        subcategory: '',
        is_active: true,
      },
    ])
    setHasChanges(true)
  }, [])

  const removeRule = useCallback((localId: string) => {
    setRules((prev) => prev.filter((r) => r.localId !== localId))
    setHasChanges(true)
  }, [])

  const updateRule = useCallback(
    (localId: string, field: keyof LocalRule, value: string | boolean) => {
      setRules((prev) =>
        prev.map((r) => (r.localId === localId ? ({ ...r, [field]: value }) : r)),
      )
      setHasChanges(true)
    },
    [],
  )

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

  // Core updater
  const updateLocalPref = useCallback(
    <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => {
      setLocalPrefs((prev) => (prev ? { ...prev, [key]: value } : prev))
      setHasChanges(true)
    },
    [],
  )

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
  }, [incomeAudit])

  /** Drop a saved classification key that matches zero ledger rows. */
  const removeIncomeKey = useCallback((key: string) => {
    setLocalPrefs((prev) => {
      if (!prev) return prev
      const next = { ...prev }
      for (const prefKey of Object.values(INCOME_CLASSIFICATION_KEY_MAP)) {
        next[prefKey] = next[prefKey].filter((saved) => saved !== key)
      }
      return next
    })
    setHasChanges(true)
  }, [])

  const updateSalaryStructure = useCallback((structure: Record<string, SalaryComponents>) => {
    setLocalSalaryStructure(structure)
    setHasChanges(true)
  }, [])

  const updateRsuGrants = useCallback((grants: RsuGrant[]) => {
    setLocalRsuGrants(grants)
    setHasChanges(true)
  }, [])

  const updateGrowthAssumptions = useCallback((assumptions: GrowthAssumptions) => {
    setLocalGrowthAssumptions(assumptions)
    setHasChanges(true)
  }, [])

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
    saveInProgress.current = true
    setIsSaving(true)
    setSaveError(null)
    setSavedAt(null)
    try {
      const original = await accountClassificationsService.getAllClassifications()
      assertCurrentSession(signal)
      const changed = Object.entries(classifications).filter(
        ([name, type]) => original[name] !== type,
      )
      await settleWrites(
        changed.map(([name, type]) => accountClassificationsService.setClassification(name, type)),
      )
      assertCurrentSession(signal)
      // The existing endpoint accepts all of these fields in one transaction.
      // Publish to the cache only after classifications and rules also settle.
      await preferencesService.updatePreferences({
        ...localPrefs,
        salary_structure: localSalaryStructure,
        rsu_grants: localRsuGrants,
        growth_assumptions: localGrowthAssumptions,
      })
      assertCurrentSession(signal)

      // Sync categorization rules: diff local rows against the server list.
      const serverRules = await categorizationRulesService.getRules()
      assertCurrentSession(signal)
      const serverById = new Map(serverRules.map((r) => [r.id, r]))
      const localIds = new Set(rules.filter((r) => r.id !== undefined).map((r) => r.id))
      const ruleOps: Promise<unknown>[] = []
      rules.forEach((rule, idx) => {
        const input: CategorizationRuleInput = {
          match_field: rule.match_field,
          pattern: rule.pattern,
          category: rule.category,
          subcategory: rule.subcategory || null,
          is_active: rule.is_active,
          sort_order: idx,
        }
        if (rule.id === undefined) {
          ruleOps.push(categorizationRulesService.createRule(input).then((created) => {
            assertCurrentSession(signal)
            // Preserve successful creates if another write fails, so retrying
            // the retained draft updates this rule instead of creating it twice.
            setRules(createdRuleIdUpdater(rule.localId, created.id))
          }))
          return
        }
        const server = serverById.get(rule.id)
        const changed =
          !server ||
          server.match_field !== rule.match_field ||
          server.pattern !== rule.pattern ||
          server.category !== rule.category ||
          server.subcategory !== rule.subcategory ||
          server.is_active !== rule.is_active ||
          server.sort_order !== idx
        if (changed) ruleOps.push(categorizationRulesService.updateRule(rule.id, input))
      })
      for (const server of serverRules) {
        if (!localIds.has(server.id)) ruleOps.push(categorizationRulesService.deleteRule(server.id))
      }
      await settleWrites(ruleOps)
      assertCurrentSession(signal)
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
      setRules(
        refreshed.map((r) => ({
          localId: String(r.id),
          id: r.id,
          match_field: r.match_field,
          pattern: r.pattern,
          category: r.category,
          subcategory: r.subcategory,
          is_active: r.is_active,
        })),
      )

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
        void invalidatePreferenceDependents(queryClient)
      }
      saveInProgress.current = false
      setIsSaving(false)
    }
  }, [classifications, localPrefs, guardDemoAction, localSalaryStructure, localRsuGrants, localGrowthAssumptions, rules, queryClient, applyingRules])

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
  }, [resetPreferences, guardDemoAction, applyingRules])

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
    isLoading, loadError, retrySettings, balancesLoading, balanceData, closedAccounts,
    localPrefs, hasChanges, isSaving, isResetting, saveError, savedAt, showResetConfirm, setShowResetConfirm,
    classifications, setClassifications, setHasChanges,
    draggedItem, setDraggedItem, dragType, setDragType,
    visibleWidgets, setVisibleWidgets,
    accounts, allExpenseCategories, allIncomeCategories,
    investmentAccounts, creditCardAccounts, accountsByCategory,
    unclassifiedAccounts, excludedAccounts, fixedCategories,
    incomeAudit, applyIncomeSuggestions, removeIncomeKey, unmappedInvestmentAccounts,
    updateLocalPref, setLocalPrefs, handleSave, handleReset,
    localSalaryStructure, updateSalaryStructure,
    localRsuGrants, updateRsuGrants,
    localGrowthAssumptions, updateGrowthAssumptions,
    rules, addRule, removeRule, updateRule, handleApplyRules, applyingRules,
  }
}
