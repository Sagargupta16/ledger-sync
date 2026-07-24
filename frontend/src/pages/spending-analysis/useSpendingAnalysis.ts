/**
 * Data + derived state for the Spending Analysis page. Owns transactions,
 * date + category filtering, the spending totals/breakdown, and the 50/30/20
 * budget-rule computations so the page component stays presentational.
 */

import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'
import { calculateSpendingBreakdown } from '@/lib/preferencesUtils'
import { filterTransactionsByDateRange, computeCategoryBreakdown } from '@/lib/transactionUtils'
import { formatMonthKey } from '@/lib/dateUtils'

import { buildSpendingChartData, computeBudgetRuleMetrics } from './spendingAnalysisUtils'

export function useSpendingAnalysis() {
  const [searchParams, setSearchParams] = useSearchParams()
  const categoryFilter = searchParams.get('category')
  const clearCategoryFilter = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('category')
    setSearchParams(next, { replace: true })
  }

  const {
    data: transactions = [],
    isPending: isTransactionsPending,
    isError: isTransactionsError,
    refetch: refetchTransactions,
  } = useTransactions()
  const {
    data: preferences,
    isPending: isPreferencesPending,
    isError: isPreferencesError,
    refetch: refetchPreferences,
  } = usePreferences()
  const { dateRange, timeFilterProps } = useAnalyticsTimeFilter(transactions)
  const dateRangeCompat = { start_date: dateRange.start_date ?? undefined, end_date: dateRange.end_date ?? undefined }
  const isError = isTransactionsError || isPreferencesError
  const isLoading = !isError && (isTransactionsPending || isPreferencesPending)
  const retry = () => {
    void Promise.all([refetchTransactions(), refetchPreferences()])
  }

  // Filter by date range, then by the category query param (deep-link from a
  // donut slice).
  const filteredTransactions = useMemo(() => {
    const byDate = filterTransactionsByDateRange(transactions, dateRange)
    if (!categoryFilter) return byDate
    return byDate.filter((t) => t.category === categoryFilter)
  }, [transactions, dateRange, categoryFilter])

  const totalSpending = useMemo(() => {
    return filteredTransactions
      .filter((t) => t.type === 'Expense')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
  }, [filteredTransactions])

  const totalIncome = useMemo(() => {
    return filteredTransactions
      .filter((t) => t.type === 'Income')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
  }, [filteredTransactions])

  const savings = Math.max(0, totalIncome - totalSpending)

  const categoryBreakdown = useMemo(
    () => computeCategoryBreakdown(filteredTransactions),
    [filteredTransactions],
  )

  const categoriesCount = Object.keys(categoryBreakdown).length
  const subcategoriesCount = useMemo(() => {
    const subs = new Set<string>()
    filteredTransactions.filter((t) => t.type === 'Expense' && t.subcategory).forEach((t) => subs.add(`${t.category}::${t.subcategory}`))
    return subs.size
  }, [filteredTransactions])
  const topCategoryEntry = Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1])[0]
  const topCategory = topCategoryEntry?.[0] || 'N/A'
  const topCategoryAmount = topCategoryEntry?.[1] ?? 0

  const spendingBreakdown = useMemo(() => {
    if (!preferences) return null
    return calculateSpendingBreakdown(filteredTransactions, preferences.essential_categories)
  }, [filteredTransactions, preferences])

  const monthlyAvgSpending = useMemo(() => {
    const expenses = filteredTransactions.filter((t) => t.type === 'Expense')
    if (expenses.length === 0) return 0
    const months = new Set(expenses.map((t) => t.date.slice(0, 7)))
    const total = expenses.reduce((s, t) => s + Math.abs(t.amount), 0)
    return months.size > 0 ? total / months.size : 0
  }, [filteredTransactions])

  // Monthly expense trend with a 3-month rolling average -- mirrors the Income
  // Analysis "Income Trend" chart so spend has the same period-over-period view.
  const monthlyTrendData = useMemo(() => {
    const expenses = filteredTransactions.filter((t) => t.type === 'Expense')
    const monthlyMap: Record<string, number> = {}
    for (const tx of expenses) {
      const month = tx.date.substring(0, 7) // YYYY-MM
      monthlyMap[month] = (monthlyMap[month] || 0) + Math.abs(tx.amount)
    }
    const sorted = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, expense]) => ({
        month,
        label: formatMonthKey(month, { month: 'short', year: '2-digit' }),
        expense,
      }))
    // 3-month rolling average (trailing window).
    return sorted.map((d, i) => {
      const window = sorted.slice(Math.max(0, i - 2), i + 1)
      return {
        ...d,
        expenseAvg: window.reduce((s, w) => s + w.expense, 0) / window.length,
      }
    })
  }, [filteredTransactions])

  const peakExpense = useMemo(
    () => Math.max(...monthlyTrendData.map((d) => d.expense), 0),
    [monthlyTrendData],
  )

  const spendingChartData = useMemo(
    () => buildSpendingChartData(spendingBreakdown, totalIncome, savings),
    [spendingBreakdown, savings, totalIncome],
  )

  // Spending rule targets from preferences (configurable Needs/Wants/Savings).
  const needsTarget = preferences?.needs_target_percent ?? 50
  const wantsTarget = preferences?.wants_target_percent ?? 30
  const savingsTarget = preferences?.savings_target_percent ?? 20

  const budgetRuleMetrics = useMemo(() => {
    return computeBudgetRuleMetrics(spendingBreakdown, totalIncome, savings, needsTarget, wantsTarget, savingsTarget)
  }, [spendingBreakdown, totalIncome, savings, needsTarget, wantsTarget, savingsTarget])

  return {
    categoryFilter,
    clearCategoryFilter,
    timeFilterProps,
    dateRangeCompat,
    isLoading,
    isError,
    retry,
    totalSpending, monthlyAvgSpending, savings,
    categoryBreakdown, categoriesCount, subcategoriesCount,
    topCategory, topCategoryAmount,
    spendingBreakdown, spendingChartData,
    budgetRuleMetrics,
    needsTarget, wantsTarget, savingsTarget,
    monthlyTrendData, peakExpense,
  }
}
