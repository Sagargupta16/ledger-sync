/**
 * Data + derived state for the Spending Analysis page. Owns transactions,
 * date + category filtering, the spending totals/breakdown, and the 50/30/20
 * budget-rule computations so the page component stays presentational.
 */

import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import {
  hasNoCompleteMonthBasis,
  useAnalyticsTimeFilter,
} from '@/hooks/useAnalyticsTimeFilter'
import { ROLLING_AVG_MONTHS, countRollingAvgPoints } from '@/lib/chartUtils'
import { calculateSpendingBreakdown } from '@/lib/preferencesUtils'
import { filterTransactionsByDateRange, computeCategoryBreakdown } from '@/lib/transactionUtils'
import { formatMonthKey } from '@/lib/dateUtils'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { resolveEssentialCategories } from '@/store/preferencesStore'
import type { Transaction } from '@/types'

import {
  buildSpendingChartData,
  computeBudgetRuleMetrics,
  monthlyAvgLineLabelFor,
  monthlyAvgSubtitleFor,
  monthlySpendShape,
  spanMonthKeys,
} from './spendingAnalysisUtils'

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
  const { dateRange, comparableDateRange, partialPeriod, isRangePartialOnly, timeFilterProps } =
    useAnalyticsTimeFilter(transactions)
  const dateRangeCompat = { start_date: dateRange.start_date ?? undefined, end_date: dateRange.end_date ?? undefined }
  const isError = isTransactionsError || isPreferencesError
  const isLoading = !isError && (isTransactionsPending || isPreferencesPending)
  const retry = () => {
    void Promise.all([refetchTransactions(), refetchPreferences()])
  }

  // Filter by date range, then by the category query param (deep-link from a
  // donut slice). This set backs the TOTALS -- "spent so far this month" is a
  // number the user wants, so it keeps the in-progress month.
  const filteredTransactions = useMemo(() => {
    const byDate = filterTransactionsByDateRange(transactions, dateRange)
    if (!categoryFilter) return byDate
    return byDate.filter((t: Transaction) => t.category === categoryFilter)
  }, [transactions, dateRange, categoryFilter])

  /**
   * Same set narrowed to COMPLETE months, backing every RATE and AVERAGE on the
   * page. On the real ledger the raw set put July (27 of 31 days: full rent
   * debited, salary not yet credited) beside complete months and the budget-rule
   * card read Needs 1015.3% of income for the monthly view and 47.9% for the FY,
   * against 34.1% on the FY's completed months. All three measured 2026-07-27
   * from the live workbook on the non-deleted rows the API actually returns
   * (`/api/transactions/all` filters `is_deleted`), with the stored
   * `essential_categories`. Totals above are unaffected.
   *
   * Falls back to the raw set when NOTHING survives the narrowing. That is not a
   * hypothetical: a user one month into their history sits on the default
   * all-time view, whose comparable range ends at the previous month-end and
   * matches nothing, and a `?category=X` deep-link can have every row inside the
   * month in progress. Without the fallback the whole rates half of the page
   * collapsed -- income 0 makes `buildSpendingChartData` and
   * `computeBudgetRuleMetrics` bail, and the budget card then rendered a
   * "Configure essential categories in Settings" empty state, blaming a setting
   * that was not the problem. An honest running-pace label on real numbers beats
   * a zeroed page; `noCompleteMonthBasis` is what makes the page say so.
   */
  const completeMonthTransactions = useMemo(() => {
    const byDate = filterTransactionsByDateRange(transactions, comparableDateRange)
    if (!categoryFilter) return byDate
    return byDate.filter((t: Transaction) => t.category === categoryFilter)
  }, [transactions, comparableDateRange, categoryFilter])

  /**
   * True when the rates on this page are running on the in-progress month -- the
   * range held no complete month, or the narrowing left no rows and the fallback
   * kicked in. Drives the notice copy so a running-pace figure is never presented
   * as a completed-month result.
   */
  const noCompleteMonthBasis = hasNoCompleteMonthBasis(
    isRangePartialOnly,
    completeMonthTransactions.length,
  )

  const usingCompleteMonths = completeMonthTransactions.length > 0
  const comparableTransactions = usingCompleteMonths
    ? completeMonthTransactions
    : filteredTransactions

  /**
   * The window that describes `comparableTransactions`, which must follow the
   * same fallback the ROWS do.
   *
   * Anything that divides by months in the window (see `monthlySpendShape`) needs
   * a range that actually contains those rows. Handing it `comparableDateRange`
   * unconditionally meant that on the fallback path -- where the complete-months
   * range matched nothing and the raw set was substituted -- the divisor spanned
   * months holding none of the rows, and the per-month average came back 0. That
   * is the same zeroed page the fallback exists to prevent.
   */
  const comparableSpanRange = usingCompleteMonths ? comparableDateRange : dateRange

  const totalSpending = useMemo(() => {
    return filteredTransactions
      .filter((t) => t.type === 'Expense')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
  }, [filteredTransactions])

  // Income and the savings figure derived from it feed the budget-rule
  // PERCENTAGES, so both come off the complete-months set. Mixing a month whose
  // salary has not landed into the denominator is what produced the 1015% needs
  // share and a 0% savings share.
  const totalIncome = useMemo(() => {
    return comparableTransactions
      .filter((t) => t.type === 'Income')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
  }, [comparableTransactions])

  const comparableSpending = useMemo(() => {
    return comparableTransactions
      .filter((t) => t.type === 'Expense')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
  }, [comparableTransactions])

  const savings = Math.max(0, totalIncome - comparableSpending)

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

  // Needs/Wants split is charted as a share of income, so it must sit on the
  // same complete-months basis as `totalIncome`.
  //
  // `essential_categories` goes through `resolveEssentialCategories` rather than
  // straight off the wire: the backend column default is the JSON string "[]",
  // so an unconfigured user sends `[]`, and `calculateSpendingBreakdown`'s
  // `custom ?? getPrefs()...` override short-circuits the store default with it
  // -- booking 100% of spend discretionary (0% needs on 50/30/20).
  const spendingBreakdown = useMemo(() => {
    if (!preferences) return null
    return calculateSpendingBreakdown(
      comparableTransactions,
      resolveEssentialCategories(preferences.essential_categories),
    )
  }, [comparableTransactions, preferences])

  /**
   * Per-month AVERAGE. Runs on complete months, so a 27-day month cannot count
   * as a full one in the divisor (real ledger, FY window on 2026-07-27:
   * 94,373.35 with the partial month vs 89,947.25 across the three complete
   * ones), and the divisor is every CALENDAR month in the window rather than
   * only the months that carry a row -- see `monthlySpendShape` for the measured
   * gap, which reaches 81% on a sparse category deep-link.
   *
   * `median` rides along for the subtitle: monthly spend is heavily skewed on
   * real data (all-time mean 43,190.00 against a median month of 12,101.31,
   * 3.6x), so the mean alone reads as a typical month when it is not.
   */
  const monthlySpend = useMemo(
    () =>
      monthlySpendShape(
        comparableTransactions.filter((t) => t.type === 'Expense'),
        comparableSpanRange,
      ),
    [comparableTransactions, comparableSpanRange],
  )
  const monthlyAvgSpending = monthlySpend?.mean ?? 0
  const monthlyAvgSubtitle = monthlyAvgSubtitleFor(monthlySpend, formatCurrency)
  /**
   * The same mean, labelled for the chart. The Expense Trend draws
   * `monthlyAvgSpending` as its "Avg" reference line, so the on-chart text has to
   * name the divisor too -- a bare "Avg" over a calendar-month mean can sit below
   * every bar on a sparse window and still call itself their average.
   */
  const monthlyAvgLineLabel = monthlyAvgLineLabelFor(
    monthlySpend,
    formatCurrencyShort,
    monthlyAvgSpending,
  )

  /**
   * Monthly expense trend with a rolling average over exactly
   * {@link ROLLING_AVG_MONTHS} months -- mirrors the Income Analysis "Income
   * Trend" chart so spend has the same period-over-period view. Month-vs-month
   * by construction, so it runs on complete months: a stub bar for a month five
   * days from over reads as a collapse in spending.
   *
   * The window used to be `slice(max(0, i - 2), i + 1)` divided by its own
   * length, so the first two points divided by 1 and 2 while the legend, the
   * tooltip and the chart's ariaLabel all still read "3-month rolling average".
   * Measured on the real ledger over the DEFAULT FY window (2026-04..2026-06,
   * exactly three complete months): 2026-04 plotted 77,700.92 from a one-month
   * window and 2026-05 plotted 80,666.86 from a two-month window; only 2026-06's
   * 89,947.25 was a real three-month mean. Two of the three "3m avg" points were
   * therefore raw monthly spend redrawn as a trend.
   *
   * A short window now yields `undefined`, which leaves FEWER average points than
   * data points -- see `rollingAvgPointCount` for why that count has to travel
   * with the series.
   *
   * The series also runs on a CONTIGUOUS month spine rather than only the months
   * carrying a row. Sliding a 3-element window over a gappy list silently reaches
   * further back than 3 calendar months, and drops the zero month out of the
   * average entirely: the real ledger has no expense in 2019-03, so the window
   * ending 2019-05 averaged Feb/Apr/May and published 654.33 where those three
   * calendar months average 521.00 (+25.6%). The gap also broke the x-axis, which
   * jumped Feb to Apr at even spacing as though no time passed.
   *
   * That spine is the SAME one the "Monthly Avg" KPI divides by
   * ({@link spanMonthKeys}), because the chart draws that KPI as its "Avg"
   * reference line. Spanning only the row-bearing months here while the KPI spans
   * the selected window put the line below every bar it claimed to average:
   * measured this session on a yearly-2025 window whose rows start in June, 7
   * bars of 70,000.00 sat above an Avg line of 40,833.33. Sharing the spine makes
   * the line the arithmetic mean of the plotted bars by construction, and the
   * empty months it adds are real zero-spend months, which the axis should show.
   */
  const monthlyTrendData = useMemo(() => {
    const expenses = comparableTransactions.filter((t) => t.type === 'Expense')
    const monthlyMap: Record<string, number> = {}
    for (const tx of expenses) {
      const month = tx.date.substring(0, 7) // YYYY-MM
      monthlyMap[month] = (monthlyMap[month] || 0) + Math.abs(tx.amount)
    }
    const withRows = Object.keys(monthlyMap).sort((a, b) => a.localeCompare(b))
    if (withRows.length === 0) return []
    const sorted = spanMonthKeys(withRows, comparableSpanRange).map((month) => ({
      month,
      label: formatMonthKey(month, { month: 'short', year: '2-digit' }),
      expense: monthlyMap[month] ?? 0,
    }))
    return sorted.map((d, i) => {
      const window =
        i + 1 >= ROLLING_AVG_MONTHS ? sorted.slice(i + 1 - ROLLING_AVG_MONTHS, i + 1) : null
      return {
        ...d,
        expenseAvg: window
          ? window.reduce((s, w) => s + w.expense, 0) / window.length
          : undefined,
      }
    })
  }, [comparableTransactions, comparableSpanRange])

  /** How many rolling-average points actually exist -- see `countRollingAvgPoints`. */
  const rollingAvgPointCount = useMemo(
    () => countRollingAvgPoints(monthlyTrendData, (d) => d.expenseAvg),
    [monthlyTrendData],
  )

  const peakExpense = useMemo(
    () => Math.max(...monthlyTrendData.map((d) => d.expense), 0),
    [monthlyTrendData],
  )

  const spendingChartData = useMemo(
    () => buildSpendingChartData(spendingBreakdown, totalIncome, savings),
    [spendingBreakdown, savings, totalIncome],
  )

  // Spending rule targets from preferences (configurable Needs/Wants).
  const needsTarget = preferences?.needs_target_percent ?? 50
  const wantsTarget = preferences?.wants_target_percent ?? 30
  /**
   * The savings floor comes from `savings_goal_percent`, NOT from
   * `savings_target_percent` -- the two preferences score different numerators
   * and this page computes the first one.
   *
   * `savings` here is `totalIncome - comparableSpending` (see above): income the
   * user did not consume, wherever it ended up. `savings_target_percent` is the
   * third leg of the 50/30/20 triplet and is scored on /budgets against the NET
   * CHANGE IN THE INVESTMENT PERIMETER -- money actually moved into
   * SIP/PPF/EPF/NPS/stocks. Those are not the same bar: 20% of income left over
   * is far easier to clear than 20% of income allocated into instruments, and on
   * the real ledger for FY2025-26 the two numerators are 1,182,355.68 and
   * 578,428.79 (see `pages/budget/BudgetPage.tsx`). Reading one preference
   * against both let /budgets report "under target" while this page reported "on
   * track" for the same user in the same period.
   *
   * `savings_goal_percent` is the app's income-minus-expenses target already:
   * the health score's "Spend Less Than Income" metric
   * (`components/analytics/health/healthScoreScorers.ts`) and the Trends
   * cumulative-savings-rate goal line
   * (`pages/trends-forecasts/components/SavingsRateSection.tsx`) both score it
   * against exactly this quantity. This page was the only
   * income-minus-expenses surface reaching for the allocation target instead.
   * Both columns default to 20.0, so no existing user's setting changes meaning.
   *
   * Consequence for the heading: needs + wants + this no longer necessarily sum
   * to 100, so `BudgetRuleAnalysis` must not print them as a "50/30/20" triplet.
   * See `lib/savingsRate.ts` for why the two numerators stay separate.
   */
  const savingsTarget = preferences?.savings_goal_percent ?? 20

  const budgetRuleMetrics = useMemo(() => {
    return computeBudgetRuleMetrics(spendingBreakdown, totalIncome, savings, needsTarget, wantsTarget, savingsTarget)
  }, [spendingBreakdown, totalIncome, savings, needsTarget, wantsTarget, savingsTarget])

  return {
    categoryFilter,
    clearCategoryFilter,
    timeFilterProps,
    dateRangeCompat,
    partialPeriod,
    noCompleteMonthBasis,
    isLoading,
    isError,
    retry,
    totalSpending, monthlyAvgSpending, monthlyAvgSubtitle, monthlyAvgLineLabel, savings,
    categoryBreakdown, categoriesCount, subcategoriesCount,
    topCategory, topCategoryAmount,
    spendingBreakdown, spendingChartData,
    budgetRuleMetrics,
    needsTarget, wantsTarget, savingsTarget,
    monthlyTrendData, peakExpense,
    rollingAvgPointCount, rollingAvgMonths: ROLLING_AVG_MONTHS,
  }
}
