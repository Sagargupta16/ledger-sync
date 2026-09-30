/**
 * useDashboardMetrics
 *
 * Custom hook that encapsulates all data-fetching and computation logic
 * previously spread across DashboardPage's 12+ useMemo hooks.
 *
 * Returns a clean interface that DashboardPage can render directly.
 */

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  dataDateRangeOptions,
  earningStartEvidenceOptions,
  incomeAnalysisOptions,
  useCategoryBreakdown,
  useRecentTransactions,
  useMonthlyAggregation,
  useTotals,
} from '@/hooks/api/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { usePreferencesStore, resolveIncomeClassification } from '@/store/preferencesStore'
import {
  type AnalyticsViewMode,
  getAnalyticsDateRange,
  getCurrentYear,
  getCurrentMonth,
  getCurrentFY,
  filterTransactionsByDateRange,
} from '@/lib/dateUtils'
import { formatDate } from '@/lib/formatters'
import { INCOME_CATEGORY_COLORS } from '@/lib/preferencesUtils'
import { completeMonthKeys } from '@/lib/savingsRate'
import { computeMonthlyChanges, type MonthlyChanges } from '@/lib/finance/dashboardMetrics'
import { resolveEarningStart } from '@/lib/finance/analysisPeriod'
import { investmentAccountTest, summarizeInvestmentTransfers } from '@/lib/finance/investmentFlows'
import { SEMANTIC_COLORS, getChartColor } from '@/constants/chartColors'
import type { TotalsData } from '@/services/api/calculations'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChartDatum {
  name: string
  value: number
  color: string
}

/** One complete month of the income-vs-spending bar series. */
export interface MonthlyFlowDatum {
  /** `YYYY-MM`, kept for sorting and drill-through. */
  month: string
  /** Short display label, e.g. `Jul 26`. */
  label: string
  income: number
  /** Absolute value -- the API returns expense as a negative. */
  expense: number
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

  /**
   * `/totals` for the window. `net_savings` is income - spending - classified
   * realised losses and `savings_rate` is `net_savings / income`: the one
   * savings definition every page shows.
   */
  filteredTotals: TotalsData | undefined
  /** Every query, the full ledger included. */
  isLoading: boolean
  /** The rollup-backed summary only; the ledger may still be in flight. */
  isSummaryLoading: boolean
  /** The full ledger behind the row-level metrics is still loading. */
  isLedgerLoading: boolean
  isError: boolean
  retry: () => void

  /** The selected window holds at least one transaction (any type). */
  hasTransactionsInRange: boolean

  // Transactions filtered by selected time range
  filteredTransactions: import('@/types').Transaction[]

  // Income breakdown
  incomeBreakdown: Record<string, number> | null
  /**
   * Net cashback for the window: income rows whose subcategory says cashback,
   * minus "cashback shared" transfers -- the same rule and number as the Quick
   * Insights "Net Cashback Earned" card. Refunds and reimbursements excluded.
   */
  cashbacksTotal: number
  incomeChartData: ChartDatum[]

  // Expense breakdown by category
  expenseChartData: ChartDatum[]

  // Sparklines
  incomeSparkline: number[]
  expenseSparkline: number[]

  // Income-vs-spending bars, complete months only
  monthlyFlow: MonthlyFlowDatum[]
  /** The in-progress month excluded from `monthlyFlow`, when there is one. */
  partialMonthLabel: string | null

  // Month-over-month changes
  momChanges: MonthlyChanges
  investmentTransfers: ReturnType<typeof summarizeInvestmentTransfers>
  hasInvestmentMappings: boolean
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useDashboardMetrics(): DashboardMetrics {
  const defaultTimeRange = usePreferencesStore((state) => state.displayPreferences.defaultTimeRange)
  const preferencesQuery = usePreferences()
  const preferences = preferencesQuery.data
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month ?? 4

  // Time-filter state
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>(
    (defaultTimeRange as AnalyticsViewMode) || 'all_time',
  )
  const [currentYear, setCurrentYear] = useState(getCurrentYear)
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth)
  const [currentFY, setCurrentFY] = useState(() => getCurrentFY(fiscalYearStartMonth))

  // viewMode and currentFY are seeded ONCE, before /api/preferences resolves:
  // the FY from the default start month (4) and the view from whatever the
  // persisted store held (its default is 'all_time'). useState initializers
  // never re-run, so a user with a non-April fiscal year or a saved default
  // range kept the seed until they touched the selector -- the Dashboard opened
  // on all-time while every useAnalyticsTimeFilter page opened on the saved
  // range. Mirror that hook's render-phase adjustment: when preferences arrive,
  // resync both -- but only until the user interacts, so a deliberate selection
  // is never clobbered. The saved range is read off the query data, not the
  // store, because the store hydrates in an effect after this render.
  const [userInteracted, setUserInteracted] = useState(false)
  const [syncedPrefs, setSyncedPrefs] = useState<string | null>(null)
  const savedTimeRange = preferences?.default_time_range
  const prefsSyncKey = `${fiscalYearStartMonth}|${savedTimeRange ?? ''}`
  if (preferences && !userInteracted && syncedPrefs !== prefsSyncKey) {
    setSyncedPrefs(prefsSyncKey)
    setCurrentFY(getCurrentFY(fiscalYearStartMonth))
    if (savedTimeRange) setViewMode(savedTimeRange as AnalyticsViewMode)
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
  //
  // The KPIs, charts and breakdowns read rollups and SQL aggregates. The full
  // ledger (~2.9 MB) is still fetched for the row-level metrics that no
  // endpoint reproduces -- Age of Money's FIFO matching, Days of Buffering's
  // lookback, investment-transfer classification -- but it no longer gates the
  // summary, so the page paints without waiting for it.
  useRecentTransactions(5) // keep prefetch warm for other pages
  const totalsQuery = useTotals(dateRange)
  const monthlyQuery = useMonthlyAggregation(dateRange)
  const dateRangeQuery = useQuery(dataDateRangeOptions())
  const transactionsQuery = useTransactions()
  const filteredTotals = totalsQuery.data
  const monthlyData = monthlyQuery.data
  const allTransactions = transactionsQuery.data

  // `?? []` per field was the bug: the backend column default is the JSON string
  // "[]", so an unconfigured user sends four empty lists, and a cashback match
  // against them reads 0. `resolveIncomeClassification` applies the group rule
  // instead (defaults only when all four are empty; a populated sibling makes an
  // empty list deliberate). The endpoint owns no fallback, so send the resolved list.
  const cashbackCategories = useMemo(
    () => (preferences ? resolveIncomeClassification(preferences).nonTaxable : []),
    [preferences],
  )
  // Income by category + net cashback. `/income-analysis` sums |amount| of the
  // window's Income rows per category, and its `cashbacks_total` applies the
  // `/quick-insights` cashback rule (cashback rows minus shared cashback), so
  // the Income Sources line and the band's card are one number. The
  // non-taxable list above only shapes the separate `non_taxable_total`.
  const incomeQuery = useQuery({
    ...incomeAnalysisOptions({ ...dateRange, cashback_categories: cashbackCategories }),
    enabled: preferencesQuery.isSuccess,
  })
  // Shares its cache entry with QuickInsights' identical request.
  const expenseCategoryQuery = useCategoryBreakdown({ transaction_type: 'expense', ...dateRange })

  // The saved employment start, else the first salary-like income -- inferred
  // from daily income aggregates rather than the ledger.
  const needsEarningEvidence = resolveEarningStart(preferences?.earning_start_date, []).source !== 'saved'
  const earningEvidenceQuery = useQuery({
    ...earningStartEvidenceOptions(),
    enabled: preferencesQuery.isSuccess && needsEarningEvidence,
  })

  // The expense pie reads `/category-breakdown`, which holds classified
  // realised losses out of the spending categories -- the same rule as the
  // Total Expenses KPI beside it. It used to fall back to charting every
  // Expense row once a loss was classified, so the pie total and the KPI
  // disagreed by exactly `capital_losses` for the users who had classified one.

  const isLedgerLoading = transactionsQuery.isLoading
  const isSummaryLoading =
    totalsQuery.isLoading ||
    monthlyQuery.isLoading ||
    dateRangeQuery.isLoading ||
    preferencesQuery.isLoading ||
    incomeQuery.isLoading ||
    expenseCategoryQuery.isLoading ||
    earningEvidenceQuery.isLoading
  const isLoading = isSummaryLoading || isLedgerLoading
  const isError =
    totalsQuery.isError ||
    monthlyQuery.isError ||
    dateRangeQuery.isError ||
    transactionsQuery.isError ||
    preferencesQuery.isError ||
    incomeQuery.isError ||
    expenseCategoryQuery.isError ||
    earningEvidenceQuery.isError
  const retry = () => {
    void Promise.all([
      totalsQuery.refetch(),
      monthlyQuery.refetch(),
      dateRangeQuery.refetch(),
      transactionsQuery.refetch(),
      preferencesQuery.refetch(),
      incomeQuery.refetch(),
      expenseCategoryQuery.refetch(),
      ...(needsEarningEvidence ? [earningEvidenceQuery.refetch()] : []),
    ])
  }

  // ------ Date boundaries for AnalyticsTimeFilter ------
  // Same non-deleted, non-excluded rows as the ledger's min/max date.
  const dataDateRange = useMemo(
    () => ({
      minDate: dateRangeQuery.data?.min_date ?? undefined,
      maxDate: dateRangeQuery.data?.max_date ?? undefined,
    }),
    [dateRangeQuery.data],
  )

  // ------ Filter transactions by selected time range ------
  const filteredTransactions = useMemo(
    () => filterTransactionsByDateRange(allTransactions, analyticsDateRange),
    [allTransactions, analyticsDateRange],
  )
  const investmentMappings = preferences?.investment_account_mappings
  const hasInvestmentMappings = Object.keys(investmentMappings ?? {}).length > 0
  const investmentTransfers = useMemo(
    () => summarizeInvestmentTransfers(
      filteredTransactions,
      investmentAccountTest(Object.keys(investmentMappings ?? {})),
    ),
    [filteredTransactions, investmentMappings],
  )

  // Rows in the window, all types -- the same count the ledger filter produced.
  const hasTransactionsInRange = (filteredTotals?.transaction_count ?? 0) > 0

  // ------ Income breakdown ------
  const incomeBreakdown = useMemo(() => {
    if (!hasTransactionsInRange || !incomeQuery.data) return null
    return incomeQuery.data.category_breakdown
  }, [hasTransactionsInRange, incomeQuery.data])

  const cashbacksTotal = hasTransactionsInRange ? incomeQuery.data?.cashbacks_total ?? 0 : 0

  // ------ Expense breakdown by category ------
  const expenseBreakdown = useMemo(() => {
    if (!hasTransactionsInRange) return null
    const categories = expenseCategoryQuery.data?.categories
    if (!categories) return null
    return Object.fromEntries(
      Object.entries(categories).map(([category, { total }]) => [category, total]),
    )
  }, [hasTransactionsInRange, expenseCategoryQuery.data])

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

  // ------ Income-vs-spending bars ------
  //
  // Complete months only, via the same `completeMonthKeys` the MoM deltas use --
  // one definition of "finished month" for the whole page. The in-progress month
  // pairs partial income (salary lands late) against near-full fixed costs, so
  // charting it draws a spending cliff that is a calendar artifact. The panel
  // names the excluded month instead of dropping a bar silently, matching the
  // Trends page convention.
  //
  // `completeMonthKeys` also filters FUTURE keys, which matters here: this
  // ledger holds a 2026-07-31 payroll row, and a "drop the last element"
  // approach would have kept the partial month and discarded a real one.
  const monthlyFlowAll = useMemo(() => {
    if (!monthlyData) return []
    return Object.keys(monthlyData).sort((a, b) => a.localeCompare(b))
  }, [monthlyData])

  const monthlyFlow = useMemo<MonthlyFlowDatum[]>(() => {
    if (!monthlyData) return []
    return completeMonthKeys(monthlyFlowAll).map((month) => {
      const row = monthlyData[month]
      return {
        month,
        label: formatDate(`${month}-01`, { month: 'short', year: '2-digit' }),
        income: row?.income ?? 0,
        // The API returns expense as a negative; bars need magnitude.
        expense: Math.abs(row?.expense ?? 0),
      }
    })
  }, [monthlyData, monthlyFlowAll])

  const partialMonthLabel = useMemo(() => {
    const complete = new Set(completeMonthKeys(monthlyFlowAll))
    const inProgress = monthlyFlowAll.find((key) => !complete.has(key))
    if (!inProgress) return null
    return formatDate(`${inProgress}-01`, { month: 'long', year: 'numeric' })
  }, [monthlyFlowAll])

  // ------ MoM changes ------
  const earningEvidence = earningEvidenceQuery.data
  const momChanges = useMemo(() => computeMonthlyChanges(
    monthlyData,
    new Date(),
    resolveEarningStart(
      preferences?.earning_start_date,
      (earningEvidence ?? []).map((row) => ({ ...row, type: 'Income' })),
    ).date,
  ), [monthlyData, preferences?.earning_start_date, earningEvidence])

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
    isSummaryLoading,
    isLedgerLoading,
    isError,
    retry,
    hasTransactionsInRange,
    filteredTransactions,
    incomeBreakdown,
    cashbacksTotal,
    incomeChartData,
    expenseChartData,
    incomeSparkline,
    expenseSparkline,
    monthlyFlow,
    partialMonthLabel,
    momChanges,
    investmentTransfers,
    hasInvestmentMappings,
  }
}
