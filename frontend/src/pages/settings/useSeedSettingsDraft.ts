/**
 * Seeds the Settings draft from server data: the one-time preference copy,
 * first-run income/investment auto-classification, and editable copies of
 * classifications and rules that a background refetch must not clobber mid-edit.
 */

import { useEffect, useRef } from 'react'

import type { CategorizationRule } from '@/services/api/categorizationRules'
import type { UserPreferences } from '@/services/api/preferences'
import { DEFAULT_GROWTH_ASSUMPTIONS } from '@/types/salary'
import type { AccountBalancesResponse } from '@/types'
import { sortVestings } from '@/lib/rsuVesting'

import type { LocalPrefs } from './types'
import {
  getDefaultClassifications, getDefaultIncomeClassifications, getDefaultInvestmentMappings, buildInitialLocalPrefs,
} from './helpers'
import type { useSettingsDraft } from './useSettingsDraft'

interface SeedInput {
  draft: ReturnType<typeof useSettingsDraft>
  preferences: UserPreferences | undefined
  balanceData: AccountBalancesResponse | undefined
  classificationsData: Record<string, string> | undefined
  rulesData: CategorizationRule[] | undefined
  accounts: string[]
  allIncomeCategories: Record<string, string[]>
  investmentAccounts: string[]
  isSaving: boolean
}

export function useSeedSettingsDraft({
  draft,
  preferences,
  balanceData,
  classificationsData,
  rulesData,
  accounts,
  allIncomeCategories,
  investmentAccounts,
  isSaving,
}: SeedInput) {
  const {
    localPrefs, setLocalPrefs, hasChanges, setHasChanges, setClassifications, setRules,
    setLocalSalaryStructure, setLocalRsuGrants, setLocalGrowthAssumptions,
  } = draft
  const classificationsInitialized = useRef(false)
  const rulesInitialized = useRef(false)

  // Initialize local prefs from server data
  useEffect(() => {
    if (!preferences || localPrefs) return
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
  }, [preferences, localPrefs, setLocalPrefs, setLocalSalaryStructure, setLocalRsuGrants, setLocalGrowthAssumptions])

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

    setLocalPrefs((prev) => prev ? {
      ...prev,
      taxable_income_categories: defaults.taxable,
      investment_returns_categories: defaults.investment,
      non_taxable_income_categories: defaults.non_taxable,
      other_income_categories: defaults.other,
    } : prev)
    setHasChanges(true)
  }, [localPrefs, allIncomeCategories, setLocalPrefs, setHasChanges])

  // Auto-map unmapped investment accounts using keyword matching
  useEffect(() => {
    if (!localPrefs || investmentAccounts.length === 0) return
    const unmapped = investmentAccounts.filter((acc) => !localPrefs.investment_account_mappings[acc])
    if (unmapped.length === 0) return

    const defaults = getDefaultInvestmentMappings(unmapped)
    setLocalPrefs((prev) => prev ? {
      ...prev,
      investment_account_mappings: { ...prev.investment_account_mappings, ...defaults },
    } : prev)
    setHasChanges(true)
  }, [localPrefs, investmentAccounts, setLocalPrefs, setHasChanges])

  // Keep editable copies when a background refetch arrives during an edit.
  useEffect(() => {
    if (!classificationsData || !balanceData) return
    if (classificationsInitialized.current && (hasChanges || isSaving)) return
    classificationsInitialized.current = true
    const accountStats = balanceData.accounts as
      | Record<string, { balance: number; transactions: number }>
      | undefined
    setClassifications({
      ...getDefaultClassifications(accounts, accountStats),
      ...classificationsData,
    })
  }, [classificationsData, accounts, balanceData, hasChanges, isSaving, setClassifications])

  useEffect(() => {
    if (!rulesData) return
    if (rulesInitialized.current && (hasChanges || isSaving)) return
    rulesInitialized.current = true
    setRules(rulesData.map((rule) => ({ ...rule, localId: String(rule.id) })))
  }, [rulesData, hasChanges, isSaving, setRules])
}
