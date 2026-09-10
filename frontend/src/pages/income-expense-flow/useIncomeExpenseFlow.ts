import { useCallback, useMemo, useState } from 'react'

import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'
import { useIsMobile } from '@/hooks/useIsMobile'
import { getDateKey } from '@/lib/dateUtils'
import { savingsRatePercentFromNet } from '@/lib/savingsRate'
import { FY_START_MONTH } from '@/lib/taxCalculator'
import { computePaidTax, groupTransactionsByFY, reconcileTaxWithholding } from '@/lib/finance/taxHistory'
import { selectSalaryStructure, usePreferencesStore } from '@/store/preferencesStore'

import { createSankeyNodeComponent } from './components/SankeyNodeRenderer'
import {
  attachOverviewDrills,
  buildCategoryView,
  buildOtherView,
  buildOverviewView,
  countSubBuckets,
  foldTopWithOther,
  isTaxCategory,
  tdsAtSourceLabel,
  type DrillCrumb,
  type FlowEntry,
} from './sankeyDrilldown'

export function useIncomeExpenseFlow() {
  const transactionsQuery = useTransactions()
  const preferencesQuery = usePreferences()
  const allTransactions = useMemo(
    () => transactionsQuery.data ?? [],
    [transactionsQuery.data],
  )
  const preferences = preferencesQuery.data
  const salaryStructure = usePreferencesStore(selectSalaryStructure)
  const isLoading = transactionsQuery.isLoading || preferencesQuery.isLoading
  const isError = transactionsQuery.isError || preferencesQuery.isError
  const retry = () => {
    void transactionsQuery.refetch()
    void preferencesQuery.refetch()
  }
  // Gate the horizontal Sankey to lg+ (>=1024px): it uses left/right:200 margins
  // that crush a tablet, so phones and tablets get the vertical MobileFlowView.
  const isMobile = useIsMobile(1024)

  // Share the tax engine and classified employment inputs. The flow estimates
  // withholding from net receipts, separately from annual tax liability.
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || FY_START_MONTH
  const salaryIsNetOfTds = preferences?.salary_is_net_of_tds ?? true
  const preferredRegime = preferences?.preferred_tax_regime || 'new'
  const epfTaxableFraction = preferences?.epf_withdrawal_taxable
    ? (preferences.epf_taxable_percent ?? 100) / 100
    : 0
  const incomeClassification = useMemo(
    () => ({
      taxable: preferences?.taxable_income_categories ?? [],
      investmentReturns: preferences?.investment_returns_categories ?? [],
      nonTaxable: preferences?.non_taxable_income_categories ?? [],
      other: preferences?.other_income_categories ?? [],
    }),
    [preferences],
  )

  const { dateRange, currentFY, timeFilterProps } = useAnalyticsTimeFilter(allTransactions)

  // Drill path (breadcrumb stack). Empty = the full overview diagram.
  const [drillPath, setDrillPath] = useState<DrillCrumb[]>([])
  // Last navigation direction + the clicked node's chart coordinates. Forward
  // zooms the new view IN from the clicked spot; back zooms it OUT from center.
  const [drillDirection, setDrillDirection] = useState<'in' | 'out'>('in')
  const [zoomOrigin, setZoomOrigin] = useState<{ x: number; y: number } | null>(null)

  const fyTransactions = useMemo(() => {
    const startDate = dateRange.start_date
    if (!startDate) return allTransactions.filter((txn) => !txn.is_transfer)

    return allTransactions.filter((txn) => {
      if (txn.is_transfer) return false
      const txDate = getDateKey(txn.date)
      return txDate >= startDate && (!dateRange.end_date || txDate <= dateRange.end_date)
    })
  }, [allTransactions, dateRange])

  // Changing the time filter can remove the drilled category entirely, so a
  // period switch always returns to the overview. State-adjust-during-render
  // (not an effect) per React's "adjusting state when props change" pattern.
  const rangeKey = `${dateRange.start_date ?? ''}|${dateRange.end_date ?? ''}`
  const [prevRangeKey, setPrevRangeKey] = useState(rangeKey)
  if (rangeKey !== prevRangeKey) {
    setPrevRangeKey(rangeKey)
    setDrillPath([])
  }

  const drillInto = useCallback((crumb: DrillCrumb, origin?: { x: number; y: number }) => {
    setDrillDirection('in')
    setZoomOrigin(origin ?? null)
    setDrillPath((path) => [...path, crumb])
  }, [])

  /** Truncate to the first `depth` crumbs; 0 = back to overview. */
  const drillTo = useCallback((depth: number) => {
    setDrillDirection('out')
    setZoomOrigin(null)
    setDrillPath((path) => (depth >= path.length ? path : path.slice(0, depth)))
  }, [])

  const drillBack = useCallback(() => {
    setDrillDirection('out')
    setZoomOrigin(null)
    setDrillPath((path) => path.slice(0, -1))
  }, [])

  const computed = useMemo(() => {
    const incomeByCategory = fyTransactions
      .filter((txn) => txn.type === 'Income')
      .reduce(
        (acc, txn) => {
          const category = txn.category || 'Other Income'
          acc[category] = (acc[category] || 0) + txn.amount
          return acc
        },
        {} as Record<string, number>,
      )

    // Tax outflows split from living expenses: the Sankey shows Tax as its own
    // branch out of Total Income, so "Expenses" reads as living costs.
    const expenseByCategory: Record<string, number> = {}
    const taxByCategory: Record<string, number> = {}
    for (const txn of fyTransactions) {
      if (txn.type !== 'Expense') continue
      const category = txn.category || 'Other Expense'
      const target = isTaxCategory(category) ? taxByCategory : expenseByCategory
      target[category] = (target[category] || 0) + txn.amount
    }

    const totalIncome = Object.values(incomeByCategory).reduce((a, b) => a + b, 0)
    const totalExpense = Object.values(expenseByCategory).reduce((a, b) => a + b, 0)
    const totalTax = Object.values(taxByCategory).reduce((a, b) => a + b, 0)
    const netSavings = totalIncome - totalExpense - totalTax
    // Tax is a third outflow here, so this is the from-net route: `netSavings`
    // is already income minus expenses minus tax, and the shared module recovers
    // the combined outflow rather than being handed one of the two pieces.
    const savingsRate = savingsRatePercentFromNet(netSavings, totalIncome) ?? 0

    // Top-N + "Other" so every visible flow reconciles with the totals (and
    // therefore the KPI cards). A raw slice(0,10) silently dropped categories
    // 11+, so the flows didn't sum to Total Income / Expenses for users with
    // many categories.
    const incomeFold = foldTopWithOther(incomeByCategory, 'Other Income')
    const expenseFold = foldTopWithOther(expenseByCategory, 'Other Expense')

    // Categories with >= 2 subcategory buckets are click-to-drill; the folded
    // "Other (n)" node drills into the tail it hides.
    const subBuckets = countSubBuckets(fyTransactions)
    const topIncome = attachOverviewDrills(
      incomeFold.entries,
      incomeFold.tail,
      'income',
      subBuckets.income,
    )
    const topExpense = attachOverviewDrills(
      expenseFold.entries,
      expenseFold.tail,
      'expense',
      subBuckets.expense,
    )

    // Group the filtered window by FY and estimate withholding from net
    // employment receipts. Gross receipts alone do not establish tax payment.
    // The inferred amount above explicit tax transactions is shown separately.
    const byFY = groupTransactionsByFY(
      fyTransactions,
      fiscalYearStartMonth,
      incomeClassification,
      epfTaxableFraction,
      salaryStructure,
    )
    const computedTax = Object.entries(byFY).reduce(
      (sum, [fy, fyData]) =>
        sum + computePaidTax(fy, fyData, null, preferredRegime, salaryIsNetOfTds),
      0,
    )
    const { tdsAtSource, taxTotal } = reconcileTaxWithholding(computedTax, totalTax)

    // Tax node drills into its breakdown: explicit tax categories plus the
    // computed at-source figure when present.
    const taxEntries: FlowEntry[] = Object.entries(taxByCategory)
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({
        name,
        amount,
        drill: (subBuckets.expense.get(name)?.size ?? 0) >= 2
          ? { label: name, view: 'category' as const, flow: 'expense' as const }
          : null,
      }))
    if (tdsAtSource > 0) {
      taxEntries.push({
        name: tdsAtSourceLabel(preferredRegime),
        amount: tdsAtSource,
        drill: null,
      })
      taxEntries.sort((a, b) => b.amount - a.amount)
    }
    let taxDrill: DrillCrumb | null = null
    if (taxEntries.length > 1) {
      taxDrill = { label: 'Tax', view: 'other', flow: 'expense', tail: taxEntries }
    } else if (taxEntries.length === 1) {
      taxDrill = taxEntries[0].drill ?? null
    }

    return {
      totalIncome,
      totalExpense,
      totalTax: taxTotal,
      tdsAtSource,
      netSavings,
      savingsRate,
      topIncome,
      topExpense,
      taxDrill,
    }
  }, [
    fyTransactions,
    fiscalYearStartMonth,
    incomeClassification,
    epfTaxableFraction,
    preferredRegime,
    salaryIsNetOfTds,
    salaryStructure,
  ])

  // The currently displayed view: overview, a category's subcategories, or an
  // unfolded "Other" tail. Fresh { nodes, links } object per level -- Recharts
  // links reference nodes by array index, so indexes are rebuilt per view.
  const view = useMemo(() => {
    const crumb = drillPath.at(-1)
    if (!crumb) {
      return buildOverviewView({
        incomeEntries: computed.topIncome,
        expenseEntries: computed.topExpense,
        totalIncome: computed.totalIncome,
        totalExpense: computed.totalExpense,
        netSavings: computed.netSavings,
        totalTax: computed.totalTax,
        tdsAtSource: computed.tdsAtSource,
        taxDrill: computed.taxDrill,
      })
    }
    if (crumb.view === 'other') return buildOtherView(crumb)
    return buildCategoryView(fyTransactions, crumb)
  }, [drillPath, computed, fyTransactions])

  const chartWidth = isMobile ? 720 : 900
  const sankeyNodeComponent = useMemo(
    () =>
      createSankeyNodeComponent({
        meta: view.meta,
        chartWidth,
        fontSize: isMobile ? 11 : 13,
        onDrill: drillInto,
      }),
    [view.meta, chartWidth, isMobile, drillInto],
  )

  return {
    ...computed,
    isLoading,
    isError,
    retry,
    hasTransactions: allTransactions.length > 0,
    isMobile,
    currentFY,
    timeFilterProps,
    view,
    drillPath,
    drillDirection,
    zoomOrigin,
    drillInto,
    drillTo,
    drillBack,
    sankeyNodeComponent,
  }
}
