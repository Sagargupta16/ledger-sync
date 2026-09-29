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
} from '@/lib/dateUtils'
import {
  calculateExpenseByCategoryBreakdown,
  INCOME_CATEGORY_COLORS,
} from '@/lib/preferencesUtils'
import { completeMonthKeys } from '@/lib/savingsRate'
import { computeMonthlyChanges, type MonthlyChanges } from '@/lib/finance/dashboardMetrics'
import { resolveEarningStart } from '@/lib/finance/analysisPeriod'
import { investmentAccountTest, summarizeInvestmentTransfers } from '@/lib/finance/investmentFlows'
import { filterTransactionsByDateRange } from '@/lib/transactionUtils'
import { SEMANTIC_COLORS, getChartColor } from '@/constants/chartColors'

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

  // KPI totals
  filteredTotals: {
    total_income: number
    total_expenses: number
    net_savings: number
    savings_rate: number
  } | undefined
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
  // Income by category + cashback total. `/income-analysis` sums |amount| of the
  // window's Income rows per category and matches `Category::Subcategory`
  // case-insensitively -- the same rules as the row-level helpers it replaces.
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

  // `/category-breakdown` holds classified realised losses out of expense
  // categories, while this pie has always charted every Expense row. Those two
  // agree exactly when the window has no classified loss (`capital_losses` 0,
  // which is every user who never set `capital_loss_categories`); otherwise the
  // pie keeps its row-level computation so no displayed number moves.
  const expenseFromRows = (filteredTotals?.capital_losses ?? 0) > 0

  const isLedgerLoading = transactionsQuery.isLoading
  const isSummaryLoading =
    totalsQuery.isLoading ||
    monthlyQuery.isLoading ||
    dateRangeQuery.isLoading ||
    preferencesQuery.isLoading ||
    incomeQuery.isLoading ||
    expenseCategoryQuery.isLoading ||
    earningEvidenceQuery.isLoading ||
    (expenseFromRows && isLedgerLoading)
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
    if (expenseFromRows) return calculateExpenseByCategoryBreakdown(filteredTransactions)
    const categories = expenseCategoryQuery.data?.categories
    if (!categories) return null
    return Object.fromEntries(
      Object.entries(categories).map(([category, { total }]) => [category, total]),
    )
  }, [hasTransactionsInRange, expenseFromRows, filteredTransactions, expenseCategoryQuery.data])

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
      const [y, m] = month.split('-')
      return {
        month,
        label: new Date(Number(y), Number(m) - 1).toLocaleString('default', {
          month: 'short',
          year: '2-digit',
        }),
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
    const [y, m] = inProgress.split('-')
    return new Date(Number(y), Number(m) - 1).toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    })
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
