/**
 * Custom hook encapsulating all Settings page state, derived data, and effects.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAccountBalances, useMasterCategories } from '@/hooks/useAnalytics'
import { accountClassificationsService } from '@/services/api/accountClassifications'
import { usePreferences, useUpdatePreferences, useResetPreferences } from '@/hooks/api/usePreferences'
import { toast } from 'sonner'
import type { LocalPrefs, LocalPrefKey } from './types'
import { ACCOUNT_TYPES } from './types'
import {
  getDefaultClassifications, normalizeArray, getStoredWidgets, getStoredTheme, buildInitialLocalPrefs,
} from './helpers'

export function useSettingsState() {
  // Data hooks
  const { data: preferences, isLoading: preferencesLoading } = usePreferences()
  const updatePreferences = useUpdatePreferences()
  const resetPreferences = useResetPreferences()
  const { data: masterCategories, isLoading: categoriesLoading } = useMasterCategories()
  const { data: balanceData, isLoading: balancesLoading } = useAccountBalances()

  // Local state
  const [classifications, setClassifications] = useState<Record<string, string>>({})
  const [classificationsLoading, setClassificationsLoading] = useState(true)
  const [localPrefs, setLocalPrefs] = useState<LocalPrefs | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragType, setDragType] = useState<'account' | null>(null)
  const [theme, setTheme] = useState<'dark' | 'system'>(getStoredTheme)
  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(getStoredWidgets)

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

  const allClassifiedIncome = useMemo(() => {
    if (!localPrefs) return new Set<string>()
    return new Set<string>([
      ...localPrefs.taxable_income_categories,
      ...localPrefs.investment_returns_categories,
      ...localPrefs.non_taxable_income_categories,
      ...localPrefs.other_income_categories,
    ])
  }, [localPrefs])

  const unclassifiedIncomeItems = useMemo(
    () =>
      Object.entries(allIncomeCategories).flatMap(([cat, subs]) =>
        subs.map((sub) => `${cat}::${sub}`).filter((item) => !allClassifiedIncome.has(item)),
      ),
    [allIncomeCategories, allClassifiedIncome],
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
    setLocalPrefs(buildInitialLocalPrefs(preferences as unknown as Record<string, unknown>) as unknown as LocalPrefs)
  }, [preferences, localPrefs])

  // Load account classifications
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setClassificationsLoading(true)
      try {
        const data = await accountClassificationsService.getAllClassifications()
        if (cancelled) return
        setClassifications({ ...getDefaultClassifications(accounts), ...data })
      } catch {
        if (!cancelled) toast.error('Failed to load account classifications')
      } finally {
        if (!cancelled) setClassificationsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [accounts])

  // Core updater
  const updateLocalPref = useCallback(
    <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => {
      setLocalPrefs((prev) => (prev ? { ...prev, [key]: value } : prev))
      setHasChanges(true)
    },
    [],
  )

  // Save / Reset
  const handleSave = useCallback(async () => {
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
      setHasChanges(false)
      toast.success('Settings saved successfully')
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }, [classifications, localPrefs, updatePreferences])

  const handleReset = useCallback(async () => {
    try {
      await resetPreferences.mutateAsync()
      setLocalPrefs(null)
      setHasChanges(false)
      toast.success('Settings reset to defaults')
    } catch {
      toast.error('Failed to reset settings')
    }
  }, [resetPreferences])

  const isLoading = preferencesLoading || classificationsLoading || categoriesLoading

  return {
    isLoading, balancesLoading, balanceData,
    localPrefs, hasChanges, isSaving, showResetConfirm, setShowResetConfirm,
    classifications, setClassifications, setHasChanges,
    draggedItem, setDraggedItem, dragType, setDragType,
    theme, setTheme, visibleWidgets, setVisibleWidgets,
    accounts, allExpenseCategories, allIncomeCategories,
    investmentAccounts, creditCardAccounts, accountsByCategory,
    unclassifiedAccounts, excludedAccounts, fixedCategories,
    unclassifiedIncomeItems, unmappedInvestmentAccounts,
    updateLocalPref, setLocalPrefs, handleSave, handleReset,
  }
}
