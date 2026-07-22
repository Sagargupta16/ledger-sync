import { useCallback, useMemo, useState } from 'react'

import { useTransactions } from '@/hooks/api/useTransactions'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'
import { useIsMobile } from '@/hooks/useIsMobile'
import { getDateKey } from '@/lib/dateUtils'

import { createSankeyNodeComponent } from './components/SankeyNodeRenderer'
import {
  attachOverviewDrills,
  buildCategoryView,
  buildOtherView,
  buildOverviewView,
  countSubBuckets,
  foldTopWithOther,
  type DrillCrumb,
} from './sankeyDrilldown'

export function useIncomeExpenseFlow() {
  const { data: allTransactions = [], isLoading } = useTransactions()
  // Gate the horizontal Sankey to lg+ (>=1024px): it uses left/right:200 margins
  // that crush a tablet, so phones and tablets get the vertical MobileFlowView.
  const isMobile = useIsMobile(1024)

  const { dateRange, currentFY, timeFilterProps } = useAnalyticsTimeFilter(allTransactions)

  // Drill path (breadcrumb stack). Empty = the full overview diagram.
  const [drillPath, setDrillPath] = useState<DrillCrumb[]>([])

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

  const drillInto = useCallback((crumb: DrillCrumb) => {
    setDrillPath((path) => [...path, crumb])
  }, [])

  /** Truncate to the first `depth` crumbs; 0 = back to overview. */
  const drillTo = useCallback((depth: number) => {
    setDrillPath((path) => (depth >= path.length ? path : path.slice(0, depth)))
  }, [])

  const drillBack = useCallback(() => {
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

    const expenseByCategory = fyTransactions
      .filter((txn) => txn.type === 'Expense')
      .reduce(
        (acc, txn) => {
          const category = txn.category || 'Other Expense'
          acc[category] = (acc[category] || 0) + txn.amount
          return acc
        },
        {} as Record<string, number>,
      )

    const totalIncome = Object.values(incomeByCategory).reduce((a, b) => a + b, 0)
    const totalExpense = Object.values(expenseByCategory).reduce((a, b) => a + b, 0)
    const netSavings = totalIncome - totalExpense
    const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0

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

    return { totalIncome, totalExpense, netSavings, savingsRate, topIncome, topExpense }
  }, [fyTransactions])

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
    isMobile,
    currentFY,
    timeFilterProps,
    view,
    drillPath,
    drillInto,
    drillTo,
    drillBack,
    sankeyNodeComponent,
  }
}
