/**
 * Read-only data the Settings page derives from its queries and the draft.
 */

import { useMemo } from 'react'

import type { IncomeFacetsData, MasterCategories } from '@/services/api/calculations'
import type { AccountBalancesResponse } from '@/types'

import type { LocalPrefs } from './types'
import { ACCOUNT_TYPES } from './types'
import type { IncomeFacet } from './helpers'
import { auditIncomeClassification, normalizeArray } from './helpers'

interface SettingsDerivedInput {
  balanceData: AccountBalancesResponse | undefined
  masterCategories: MasterCategories | undefined
  incomeFacetsData: IncomeFacetsData | undefined
  classifications: Record<string, string>
  localPrefs: LocalPrefs | null
}

export function useSettingsDerived({
  balanceData,
  masterCategories,
  incomeFacetsData,
  classifications,
  localPrefs,
}: SettingsDerivedInput) {
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

  return {
    accounts,
    allExpenseCategories,
    allIncomeCategories,
    investmentAccounts,
    creditCardAccounts,
    accountsByCategory,
    unclassifiedAccounts,
    excludedAccounts,
    fixedCategories,
    incomeAudit,
    unmappedInvestmentAccounts,
  }
}
