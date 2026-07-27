/**
 * Custom hook encapsulating all Settings page state, derived data, and effects.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccountBalances, useIncomeFacets, useMasterCategories } from '@/hooks/api/useAnalytics'
import { useClosedAccounts } from '@/hooks/api/useAccountStatus'
import { accountClassificationsService } from '@/services/api/accountClassifications'
import { categorizationRulesService, type CategorizationRuleInput } from '@/services/api/categorizationRules'
import { preferencesService } from '@/services/api/preferences'
import { usePreferences, useUpdatePreferences, useResetPreferences } from '@/hooks/api/usePreferences'
import { toast } from 'sonner'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import type { SalaryComponents, RsuGrant, GrowthAssumptions } from '@/types/salary'
import { DEFAULT_GROWTH_ASSUMPTIONS } from '@/types/salary'
import { sortVestings } from '@/lib/rsuVesting'
import type { LocalPrefs, LocalPrefKey, LocalRule } from './types'
import { ACCOUNT_TYPES, INCOME_CLASSIFICATION_KEY_MAP } from './types'
import type { IncomeFacet } from './helpers'
import {
  auditIncomeClassification, getDefaultClassifications, getDefaultIncomeClassifications, getDefaultInvestmentMappings, normalizeArray, getStoredWidgets, buildInitialLocalPrefs,
} from './helpers'

export function useSettingsState() {
  // Data hooks
  const {
    data: preferences,
    isLoading: preferencesLoading,
    isError: preferencesError,
    refetch: refetchPreferences,
  } = usePreferences()
  const updatePreferences = useUpdatePreferences()
  const resetPreferences = useResetPreferences()
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
  const [classificationsLoading, setClassificationsLoading] = useState(true)
  const [classificationsError, setClassificationsError] = useState(false)
  const [localPrefs, setLocalPrefs] = useState<LocalPrefs | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragType, setDragType] = useState<'account' | null>(null)
  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(getStoredWidgets)
  const [localSalaryStructure, setLocalSalaryStructure] = useState<Record<string, SalaryComponents>>({})
  const [localRsuGrants, setLocalRsuGrants] = useState<RsuGrant[]>([])
  const [localGrowthAssumptions, setLocalGrowthAssumptions] = useState<GrowthAssumptions>({ ...DEFAULT_GROWTH_ASSUMPTIONS })
  const [rules, setRules] = useState<LocalRule[]>([])
  const [rulesLoading, setRulesLoading] = useState(true)
  const [rulesError, setRulesError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [applyingRules, setApplyingRules] = useState(false)
  const queryClient = useQueryClient()

  // Derived data
  const accounts = useMemo(() => {
    const acc = balanceData?.accounts || {}
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

  // Load account classifications. The default guesses use balance sign as a
  // second-pass signal (see getDefaultClassifications); user-saved
  // classifications from the server still win via the spread below.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setClassificationsLoading(true)
      setClassificationsError(false)
      try {
        const data = await accountClassificationsService.getAllClassifications()
        if (cancelled) return
        const accountStats = balanceData?.accounts as
          | Record<string, { balance: number; transactions: number }>
          | undefined
        setClassifications({ ...getDefaultClassifications(accounts, accountStats), ...data })
      } catch {
        if (!cancelled) setClassificationsError(true)
      } finally {
        if (!cancelled) setClassificationsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [accounts, balanceData, reloadToken])

  // Load categorization rules
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setRulesLoading(true)
      setRulesError(false)
      try {
        const data = await categorizationRulesService.getRules()
        if (cancelled) return
        setRules(
          data.map((r) => ({
            localId: String(r.id),
            id: r.id,
            match_field: r.match_field,
            pattern: r.pattern,
            category: r.category,
            subcategory: r.subcategory,
            is_active: r.is_active,
          })),
        )
      } catch {
        if (!cancelled) setRulesError(true)
      } finally {
        if (!cancelled) setRulesLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [reloadToken])

  const retrySettings = useCallback(async () => {
    setReloadToken((current) => current + 1)
    await Promise.all([
      refetchPreferences(),
      refetchCategories(),
      refetchBalances(),
      refetchClosedAccounts(),
      refetchIncomeFacets(),
    ])
  }, [refetchPreferences, refetchCategories, refetchBalances, refetchClosedAccounts, refetchIncomeFacets])

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
        prev.map((r) => (r.localId === localId ? ({ ...r, [field]: value } as LocalRule) : r)),
      )
      setHasChanges(true)
    },
    [],
  )

  const handleApplyRules = useCallback(async () => {
    if (guardDemoAction('Applying rules')) return
    setApplyingRules(true)
    try {
      const res = await categorizationRulesService.applyRules()
      toast.success(`Updated ${res.updated} of ${res.matched} matching transactions`)
      // Retro apply changes categories AND transaction ids, so everything
      // that reads transactions or baked-in analytics must refetch.
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['transactions-page'] })
      queryClient.invalidateQueries({ queryKey: ['transaction-facets'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      queryClient.invalidateQueries({ queryKey: ['analyticsV2'] })
      queryClient.invalidateQueries({ queryKey: ['calculations'] })
    } catch {
      toast.error('Failed to apply rules')
    } finally {
      setApplyingRules(false)
    }
  }, [guardDemoAction, queryClient])

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
    if (guardDemoAction('Saving settings')) return
    setIsSaving(true)
    try {
      const original = await accountClassificationsService.getAllClassifications()
      const changed = Object.entries(classifications).filter(
        ([name, type]) => original[name] !== type,
      )
      await Promise.all(
        changed.map(([name, type]) => accountClassificationsService.setClassification(name, type)),
      )
      if (localPrefs) await updatePreferences.mutateAsync(localPrefs)
      await Promise.all([
        preferencesService.updateSalaryStructure({ salary_structure: localSalaryStructure }),
        preferencesService.updateRsuGrants({ rsu_grants: localRsuGrants }),
        preferencesService.updateGrowthAssumptions({ growth_assumptions: localGrowthAssumptions }),
      ])

      // Sync categorization rules: diff local rows against the server list.
      const serverRules = await categorizationRulesService.getRules()
      const serverById = new Map(serverRules.map((r) => [r.id, r]))
      const localIds = new Set(rules.filter((r) => r.id !== undefined).map((r) => r.id))
      const ruleOps: Promise<unknown>[] = []
      rules.forEach((rule, idx) => {
        if (!rule.pattern.trim() || !rule.category.trim()) return
        const input: CategorizationRuleInput = {
          match_field: rule.match_field,
          pattern: rule.pattern,
          category: rule.category,
          subcategory: rule.subcategory || null,
          is_active: rule.is_active,
          sort_order: idx,
        }
        if (rule.id === undefined) {
          ruleOps.push(categorizationRulesService.createRule(input))
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
      await Promise.all(ruleOps)
      // Refresh local rules so new rows pick up their server ids
      const refreshed = await categorizationRulesService.getRules()
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
      toast.success('Settings saved successfully')
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }, [classifications, localPrefs, updatePreferences, guardDemoAction, localSalaryStructure, localRsuGrants, localGrowthAssumptions, rules])

  const handleReset = useCallback(async () => {
    if (guardDemoAction('Resetting settings')) return
    try {
      await resetPreferences.mutateAsync()
      setLocalPrefs(null)
      setHasChanges(false)
      toast.success('Settings reset to defaults')
    } catch {
      toast.error('Failed to reset settings')
    }
  }, [resetPreferences, guardDemoAction])

  const isLoading =
    preferencesLoading ||
    classificationsLoading ||
    categoriesLoading ||
    balancesLoading ||
    closedAccountsLoading ||
    incomeFacetsLoading ||
    rulesLoading
  const loadError =
    preferencesError ||
    categoriesError ||
    balancesError ||
    closedAccountsError ||
    incomeFacetsError ||
    classificationsError ||
    rulesError

  return {
    isLoading, loadError, retrySettings, balancesLoading, balanceData, closedAccounts,
    localPrefs, hasChanges, isSaving, showResetConfirm, setShowResetConfirm,
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
