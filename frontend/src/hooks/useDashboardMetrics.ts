/**
 * useDashboardMetrics
 *
 * Custom hook that encapsulates all data-fetching and computation logic
 * previously spread across DashboardPage's 12+ useMemo hooks.
 *
 * Returns a clean interface that DashboardPage can render directly.
 */

import { useState, useMemo } from 'react'
import { useRecentTransactions } from '@/hooks/api/useAnalytics'
import { useMonthlyAggregation, useTotals } from '@/hooks/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { usePreferencesStore } from '@/store/preferencesStore'
import {
  type AnalyticsViewMode,
  getAnalyticsDateRange,
  getCurrentYear,
  getCurrentMonth,
  getCurrentFY,
} from '@/lib/dateUtils'
import {
  calculateIncomeByCategoryBreakdown,
  calculateSpendingBreakdown,
  calculateCashbacksTotal,
  INCOME_CATEGORY_COLORS,
  SPENDING_TYPE_COLORS,
} from '@/lib/preferencesUtils'
import { computeDataDateRange, filterTransactionsByDateRange } from '@/lib/transactionUtils'
import { SEMANTIC_COLORS } from '@/constants/chartColors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChartDatum {
  name: string
  value: number
  color: string
}

interface MoMChanges {
  income: number | undefined
  expense: number | undefined
  savings: number | undefined
  savingsRate: number | undefined
  label: string
}

export interface DashboardMetrics {
  // Time-filter state & setters
  viewMode: AnalyticsViewMode
  setViewMode: (v: AnalyticsViewMode) => void
  currentYear: number
  setCurrentYear: (y: number) => void
  currentMonth: string
  setCurrentMonth: (m: string) => void
  currentFY: string
  setCurrentFY: (fy: string) => void
  fiscalYearStartMonth: number

  // Date boundaries for the time filter navigation
  dataDateRange: { minDate: string | undefined; maxDate: string | undefined }

  // Hook-level date range (for child components expecting { start_date?, end_date? })
  dateRange: { start_date?: string; end_date?: string }

  // KPI totals
  filteredTotals: {
    total_income: number
    total_expenses: number
    net_savings: number
    savings_rate: number
  } | undefined
  isLoading: boolean

  // Transactions filtered by selected time range
  filteredTransactions: import('@/types').Transaction[]

  // Recent transactions (filter-independent)
  recentTransactions: import('@/types').Transaction[] | undefined
  isLoadingTransactions: boolean

  // Income breakdown
  incomeBreakdown: Record<string, number> | null
  cashbacksTotal: number
  incomeChartData: ChartDatum[]
  incomeColorStyles: Array<{ backgroundColor: string }>

  // Spending breakdown
  spendingBreakdown: { essential: number; discretionary: number; total: number } | null
  spendingChartData: ChartDatum[]
  spendingColorStyles: Array<{ backgroundColor: string }>
  spendingBarStyles: Array<{ width: string; backgroundColor: string }>

  // Sparklines
  incomeSparkline: number[]
  expenseSparkline: number[]

  // Month-over-month changes
  momChanges: MoMChanges
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useDashboardMetrics(): DashboardMetrics {
  const { displayPreferences } = usePreferencesStore()
  const { data: preferences } = usePreferences()
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month ?? 4

  // Time-filter state
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>(
    (displayPreferences.defaultTimeRange as AnalyticsViewMode) || 'all_time',
  )
  const [currentYear, setCurrentYear] = useState(getCurrentYear)
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth)
  const [currentFY, setCurrentFY] = useState(() => getCurrentFY(fiscalYearStartMonth))

  // Analytics date range derived from the time-filter state
  const analyticsDateRange = useMemo(
    () => getAnalyticsDateRange(viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth),
    [viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth],
  )

  // Convert null values to undefined for hooks expecting optional params
  const dateRange = useMemo(
    () => ({
      start_date: analyticsDateRange.start_date ?? undefined,
      end_date: analyticsDateRange.end_date ?? undefined,
    }),
    [analyticsDateRange],
  )

  // ------ Data fetching ------
  const { data: recentTransactions, isLoading: isLoadingTransactions } = useRecentTransactions(5)
  const { data: filteredTotals, isLoading } = useTotals(dateRange)
  const { data: monthlyData } = useMonthlyAggregation(dateRange)
  const { data: allTransactions } = useTransactions()

  // ------ Date boundaries for AnalyticsTimeFilter ------
  const dataDateRange = useMemo(
    () => computeDataDateRange(allTransactions),
    [allTransactions],
  )

  // ------ Filter transactions by selected time range ------
  const filteredTransactions = useMemo(
    () => filterTransactionsByDateRange(allTransactions, analyticsDateRange),
    [allTransactions, analyticsDateRange],
  )

  // ------ Income breakdown ------
  const incomeBreakdown = useMemo(() => {
    if (filteredTransactions.length === 0) return null
    return calculateIncomeByCategoryBreakdown(filteredTransactions)
  }, [filteredTransactions])

  const cashbacksTotal = useMemo(() => {
    if (filteredTransactions.length === 0 || !preferences) return 0
    const incomeClassification = {
      taxable: preferences.taxable_income_categories || [],
      investmentReturns: preferences.investment_returns_categories || [],
      nonTaxable: preferences.non_taxable_income_categories || [],
      other: preferences.other_income_categories || [],
    }
    return calculateCashbacksTotal(filteredTransactions, incomeClassification)
  }, [filteredTransactions, preferences])

  // ------ Spending breakdown ------
  const spendingBreakdown = useMemo(() => {
    if (filteredTransactions.length === 0 || !preferences) return null
    return calculateSpendingBreakdown(filteredTransactions, preferences.essential_categories)
  }, [filteredTransactions, preferences])

  // ------ Chart data ------
  const incomeChartData = useMemo(() => {
    if (!incomeBreakdown) return []
    const defaultColor = SEMANTIC_COLORS.muted
    return Object.entries(incomeBreakdown)
      .filter(([, value]) => value > 0)
      .map(([category, value]) => ({
        name: category,
        value,
        color: INCOME_CATEGORY_COLORS[category] || defaultColor,
      }))
      .sort((a, b) => b.value - a.value)
  }, [incomeBreakdown])

  const spendingChartData = useMemo(() => {
    if (!spendingBreakdown) return []
    return [
      { name: 'Essential', value: spendingBreakdown.essential, color: SPENDING_TYPE_COLORS.essential },
      { name: 'Discretionary', value: spendingBreakdown.discretionary, color: SPENDING_TYPE_COLORS.discretionary },
    ].filter((d) => d.value > 0)
  }, [spendingBreakdown])

  // Precomputed style objects (stable refs)
  const incomeColorStyles = useMemo(
    () => incomeChartData.map((item) => ({ backgroundColor: item.color })),
    [incomeChartData],
  )

  const spendingColorStyles = useMemo(
    () => spendingChartData.map((item) => ({ backgroundColor: item.color })),
    [spendingChartData],
  )

  const spendingBarStyles = useMemo(
    () =>
      spendingChartData.map((item) => {
        const percentage = spendingBreakdown ? (item.value / spendingBreakdown.total) * 100 : 0
        return { width: `${percentage.toFixed(1)}%`, backgroundColor: item.color }
      }),
    [spendingChartData, spendingBreakdown],
  )

  // ------ Sparklines ------
  const incomeSparkline = useMemo(() => {
    if (!monthlyData) return []
    return Object.values(monthlyData).map((m: { income?: number }) => m.income ?? 0)
  }, [monthlyData])

  const expenseSparkline = useMemo(() => {
    if (!monthlyData) return []
    return Object.values(monthlyData).map((m: { expense?: number }) => Math.abs(m.expense ?? 0))
  }, [monthlyData])

  // ------ MoM changes ------
  const momChanges = useMemo<MoMChanges>(() => {
    const noChange: MoMChanges = {
      income: undefined,
      expense: undefined,
      savings: undefined,
      savingsRate: undefined,
      label: 'vs prev month',
    }
    if (!monthlyData) return noChange
    const allMonths = Object.keys(monthlyData).sort((a, b) => a.localeCompare(b))

    const now = new Date()
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    // Drop the current month if it's the latest (incomplete)
    const completeMonths = allMonths.at(-1) === currentMonthKey ? allMonths.slice(0, -1) : allMonths

    if (completeMonths.length < 2) return noChange

    const currKey = completeMonths.at(-1) ?? ''
    const prevKey = completeMonths.at(-2) ?? ''
    const curr = monthlyData[currKey]
    const prev = monthlyData[prevKey]
    if (!curr || !prev) return noChange

    const pct = (c: number, p: number) => (p === 0 ? undefined : Number((((c - p) / p) * 100).toFixed(1)))
    const currSavingsRate = curr.income === 0 ? 0 : (curr.net_savings / curr.income) * 100
    const prevSavingsRate = prev.income === 0 ? 0 : (prev.net_savings / prev.income) * 100

    const fmt = (key: string) => {
      const [y, m] = key.split('-')
      return new Date(Number(y), Number(m) - 1).toLocaleString('default', { month: 'short' })
    }

    return {
      income: pct(curr.income, prev.income),
      expense: pct(Math.abs(curr.expense), Math.abs(prev.expense)),
      savings: pct(curr.net_savings, prev.net_savings),
      savingsRate: prev.income === 0 ? undefined : Number((currSavingsRate - prevSavingsRate).toFixed(1)),
      label: `${fmt(currKey)} vs ${fmt(prevKey)}`,
    }
  }, [monthlyData])

  return {
    viewMode,
    setViewMode,
    currentYear,
    setCurrentYear,
    currentMonth,
    setCurrentMonth,
    currentFY,
    setCurrentFY,
    fiscalYearStartMonth,
    dataDateRange,
    dateRange,
    filteredTotals,
    isLoading,
    filteredTransactions,
    recentTransactions,
    isLoadingTransactions,
    incomeBreakdown,
    cashbacksTotal,
    incomeChartData,
    incomeColorStyles,
    spendingBreakdown,
    spendingChartData,
    spendingColorStyles,
    spendingBarStyles,
    incomeSparkline,
    expenseSparkline,
    momChanges,
  }
}
