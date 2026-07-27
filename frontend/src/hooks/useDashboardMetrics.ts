/**
 * useDashboardMetrics
 *
 * Custom hook that encapsulates all data-fetching and computation logic
 * previously spread across DashboardPage's 12+ useMemo hooks.
 *
 * Returns a clean interface that DashboardPage can render directly.
 */

import { useState, useMemo } from 'react'
import { useRecentTransactions, useMonthlyAggregation, useTotals } from '@/hooks/api/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { usePreferencesStore, resolveIncomeClassification } from '@/store/preferencesStore'
import {
  type AnalyticsViewMode,
  getAnalyticsDateRange,
  getCurrentYear,
  getCurrentMonth,
  getCurrentFY,
} from '@/lib/dateUtils'
import {
  calculateIncomeByCategoryBreakdown,
  calculateExpenseByCategoryBreakdown,
  calculateCashbacksTotal,
  INCOME_CATEGORY_COLORS,
} from '@/lib/preferencesUtils'
import { completeMonthKeys, savingsRatePercent } from '@/lib/savingsRate'
import { computeDataDateRange, filterTransactionsByDateRange } from '@/lib/transactionUtils'
import { SEMANTIC_COLORS, getChartColor } from '@/constants/chartColors'

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
  isError: boolean
  retry: () => void

  // Transactions filtered by selected time range
  filteredTransactions: import('@/types').Transaction[]

  // Income breakdown
  incomeBreakdown: Record<string, number> | null
  cashbacksTotal: number
  incomeChartData: ChartDatum[]

  // Expense breakdown by category
  expenseChartData: ChartDatum[]

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
  const preferencesQuery = usePreferences()
  const preferences = preferencesQuery.data
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month ?? 4

  // Time-filter state
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>(
    (displayPreferences.defaultTimeRange as AnalyticsViewMode) || 'all_time',
  )
  const [currentYear, setCurrentYear] = useState(getCurrentYear)
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth)
  const [currentFY, setCurrentFY] = useState(() => getCurrentFY(fiscalYearStartMonth))

  // currentFY is seeded ONCE from the default fiscalYearStartMonth (4) before
  // /api/preferences resolves; useState initializers never re-run, so a user
  // with a non-April fiscal year would be stuck on the wrong FY window until
  // they touched the selector. Mirror useAnalyticsTimeFilter's render-phase
  // adjustment: when preferences arrive, resync the FY -- but only until the
  // user interacts, so we never clobber a deliberate selection.
  const [userInteracted, setUserInteracted] = useState(false)
  const [syncedFsm, setSyncedFsm] = useState<number | null>(null)
  if (preferences && !userInteracted && syncedFsm !== fiscalYearStartMonth) {
    setSyncedFsm(fiscalYearStartMonth)
    setCurrentFY(getCurrentFY(fiscalYearStartMonth))
  }

  const markInteracted = <T,>(setter: (v: T) => void) => (v: T) => {
    setUserInteracted(true)
    setter(v)
  }

  // Analytics date range derived from the time-filter state
  const analyticsDateRange = useMemo(
    () => getAnalyticsDateRange({ viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth }),
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
  useRecentTransactions(5) // keep prefetch warm for other pages
  const totalsQuery = useTotals(dateRange)
  const monthlyQuery = useMonthlyAggregation(dateRange)
  const transactionsQuery = useTransactions()
  const filteredTotals = totalsQuery.data
  const monthlyData = monthlyQuery.data
  const allTransactions = transactionsQuery.data
  const isLoading =
    totalsQuery.isLoading ||
    monthlyQuery.isLoading ||
    transactionsQuery.isLoading ||
    preferencesQuery.isLoading
  const isError =
    totalsQuery.isError ||
    monthlyQuery.isError ||
    transactionsQuery.isError ||
    preferencesQuery.isError
  const retry = () => {
    void Promise.all([
      totalsQuery.refetch(),
      monthlyQuery.refetch(),
      transactionsQuery.refetch(),
      preferencesQuery.refetch(),
    ])
  }

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

  // `?? []` per field was the bug: the backend column default is the JSON string
  // "[]", so an unconfigured user sends four empty lists, and
  // `calculateCashbacksTotal`'s `custom ?? getPrefs()...` override short-circuits
  // the store defaults with them -- no key matches, so the cashback KPI reads 0.
  // `resolveIncomeClassification` applies the group rule instead (defaults only
  // when all four are empty; a populated sibling makes an empty list deliberate).
  const cashbacksTotal = useMemo(() => {
    if (filteredTransactions.length === 0 || !preferences) return 0
    return calculateCashbacksTotal(
      filteredTransactions,
      resolveIncomeClassification(preferences),
    )
  }, [filteredTransactions, preferences])

  // ------ Expense breakdown by category ------
  const expenseBreakdown = useMemo(() => {
    if (filteredTransactions.length === 0) return null
    return calculateExpenseByCategoryBreakdown(filteredTransactions)
  }, [filteredTransactions])

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

  const expenseChartData = useMemo(() => {
    if (!expenseBreakdown) return []
    // Sort by value FIRST, then assign palette colors by rank -- assigning the
    // index-based color before the sort scrambled the dot/wedge color vs. rank.
    return Object.entries(expenseBreakdown)
      .filter(([, value]) => value > 0)
      .map(([category, value]) => ({ name: category, value }))
      .sort((a, b) => b.value - a.value)
      .map((d, i) => ({ ...d, color: getChartColor(i) }))
  }, [expenseBreakdown])

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

    // Drop every unfinished month. Testing only `at(-1)` assumed the current
    // month sorts last, so a single future-dated row (the ledger has a
    // 2026-07-31 payroll entry) left the in-progress month in as "current".
    const completeMonths = completeMonthKeys(allMonths)

    if (completeMonths.length < 2) return noChange

    const currKey = completeMonths.at(-1) ?? ''
    const prevKey = completeMonths.at(-2) ?? ''
    const curr = monthlyData[currKey]
    const prev = monthlyData[prevKey]
    if (!curr || !prev) return noChange

    const pct = (c: number, p: number) => (p === 0 ? undefined : Number((((c - p) / p) * 100).toFixed(1)))
    // For savings, use abs(prev) as denominator so a sign flip (e.g. -1000 → +500)
    // correctly shows improvement (+150%) rather than a misleading -150%.
    const savingsPct = (c: number, p: number) => (p === 0 ? undefined : Number((((c - p) / Math.abs(p)) * 100).toFixed(1)))
    // Shared definition, fed from income/expense rather than the pre-computed
    // net_savings field, so this delta cannot drift from the KPI above it.
    const currSavingsRate = savingsRatePercent({ income: curr.income, expense: Math.abs(curr.expense) })
    const prevSavingsRate = savingsRatePercent({ income: prev.income, expense: Math.abs(prev.expense) })

    const fmt = (key: string) => {
      const [y, m] = key.split('-')
      return new Date(Number(y), Number(m) - 1).toLocaleString('default', { month: 'short' })
    }

    return {
      income: pct(curr.income, prev.income),
      expense: pct(Math.abs(curr.expense), Math.abs(prev.expense)),
      savings: savingsPct(curr.net_savings, prev.net_savings),
      savingsRate:
        currSavingsRate === null || prevSavingsRate === null
          ? undefined
          : Number((currSavingsRate - prevSavingsRate).toFixed(1)),
      label: `${fmt(currKey)} vs ${fmt(prevKey)}`,
    }
  }, [monthlyData])

  return {
    viewMode,
    setViewMode: markInteracted(setViewMode),
    currentYear,
    setCurrentYear: markInteracted(setCurrentYear),
    currentMonth,
    setCurrentMonth: markInteracted(setCurrentMonth),
    currentFY,
    setCurrentFY: markInteracted(setCurrentFY),
    fiscalYearStartMonth,
    dataDateRange,
    dateRange,
    filteredTotals,
    isLoading,
    isError,
    retry,
    filteredTransactions,
    incomeBreakdown,
    cashbacksTotal,
    incomeChartData,
    expenseChartData,
    incomeSparkline,
    expenseSparkline,
    momChanges,
  }
}
