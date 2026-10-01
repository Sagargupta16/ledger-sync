/**
 * Data + derived state for the Spending Analysis page. Owns date + category
 * filtering, the spending totals/breakdown, and the 50/30/20 budget-rule
 * computations so the page component stays presentational.
 *
 * Every number comes from server aggregates (`spendingAnalysisQueries`), not
 * the full ledger. The client used to sum raw rows here, which counted realised
 * capital losses as spending even after the user classified them, while
 * `/totals` and the Dashboard held them out -- so "Total Spending" on this page
 * and "Total Expenses" on the Dashboard disagreed for the same window. The
 * server applies the one rule (only classified `capital_loss_categories` leave
 * spending) to every read below.
 */

import { useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { useDataDateRange } from '@/hooks/api/useAnalytics'
import { usePreferences } from '@/hooks/api/usePreferences'
import {
  hasNoCompleteMonthBasis,
  useAnalyticsTimeFilter,
} from '@/hooks/useAnalyticsTimeFilter'
import { ROLLING_AVG_MONTHS, countRollingAvgPoints } from '@/lib/chartUtils'
import { formatMonthKey } from '@/lib/dateUtils'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { computeBudgetRuleMetrics, monthlySpendShape, spanMonthKeys, spendingRuleSavings } from '@/lib/finance/spending'
import { resolveEssentialCategories } from '@/store/preferencesStore'

import {
  useExpenseBreakdown,
  useIncomeBreakdown,
  useMonthlyExpense,
  useRangeTotals,
  type SpendingRange,
} from './spendingAnalysisQueries'
import {
  buildSpendingChartData,
  categoryTotals,
  monthlyAvgLineLabelFor,
  monthlyAvgSubtitleFor,
  splitEssentialSpend,
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
    data: preferences,
    isPending: isPreferencesPending,
    isError: isPreferencesError,
    refetch: refetchPreferences,
  } = usePreferences()
  // Nav bounds from `/data-date-range`: the same non-deleted, non-excluded rows
  // the ledger holds, without downloading them.
  const boundsQuery = useDataDateRange()
  const { minDate, maxDate } = boundsQuery
  const bounds = useMemo(() => ({ minDate, maxDate }), [minDate, maxDate])
  const { dateRange, comparableDateRange, partialPeriod, isRangePartialOnly, timeFilterProps } =
    useAnalyticsTimeFilter(bounds)
  const windowRange = useMemo<SpendingRange>(
    () => ({ start_date: dateRange.start_date ?? undefined, end_date: dateRange.end_date ?? undefined }),
    [dateRange.start_date, dateRange.end_date],
  )
  const comparableRange = useMemo<SpendingRange>(
    () => ({
      start_date: comparableDateRange.start_date ?? undefined,
      end_date: comparableDateRange.end_date ?? undefined,
    }),
    [comparableDateRange.start_date, comparableDateRange.end_date],
  )
  const dateRangeCompat = windowRange

  // TOTALS keep the in-progress month -- "spent so far this month" is a number
  // the user wants.
  const windowExpense = useExpenseBreakdown(windowRange)

  /**
   * Every RATE and AVERAGE runs on COMPLETE months. On the real ledger the raw
   * window put July (27 of 31 days: full rent debited, salary not yet credited)
   * beside complete months and the budget-rule card read Needs 1015.3% of
   * income for the monthly view and 47.9% for the FY, against 34.1% on the FY's
   * completed months (measured 2026-07-27 with the stored
   * `essential_categories`). Totals above are unaffected.
   *
   * Falls back to the whole window when NOTHING falls inside the complete
   * months. That is not a hypothetical: a user one month into their history
   * sits on the default all-time view, whose comparable range ends at the
   * previous month-end and matches nothing, and a `?category=X` deep-link can
   * have every row inside the month in progress. Without the fallback income
   * read 0, `buildSpendingChartData` and `computeBudgetRuleMetrics` bailed, and
   * the budget card rendered a "Configure essential categories in Settings"
   * empty state, blaming a setting that was not the problem. An honest
   * running-pace label on real numbers beats a zeroed page;
   * `noCompleteMonthBasis` is what makes the page say so.
   */
  const comparableTotals = useRangeTotals(comparableRange)
  const comparableExpense = useExpenseBreakdown(comparableRange)
  const comparableIncome = useIncomeBreakdown(comparableRange, Boolean(categoryFilter))
  const comparableRowCount = categoryFilter
    ? (comparableExpense.data?.categories[categoryFilter]?.count ?? 0) +
      (comparableIncome.data?.categories[categoryFilter]?.count ?? 0)
    : (comparableTotals.data?.transaction_count ?? 0)
  const comparableLoaded = categoryFilter
    ? comparableExpense.data !== undefined && comparableIncome.data !== undefined
    : comparableTotals.data !== undefined

  /**
   * True when the rates on this page are running on the in-progress month -- the
   * range held no complete month, or the narrowing left no rows and the fallback
   * kicked in. Drives the notice copy so a running-pace figure is never presented
   * as a completed-month result.
   */
  const noCompleteMonthBasis = hasNoCompleteMonthBasis(isRangePartialOnly, comparableRowCount)

  /**
   * The window every rate and average is computed on, which must follow the
   * same fallback the ROWS do. Anything that divides by months in the window
   * (see `monthlySpendShape`) needs a range that actually contains those rows;
   * dividing the fallback rows by the empty complete-months span came back 0,
   * the same zeroed page the fallback exists to prevent. Held on the complete
   * months until their count is known, so the basis never flips mid-load.
   */
  const usingCompleteMonths = !comparableLoaded || comparableRowCount > 0
  const basisRange = usingCompleteMonths ? comparableRange : windowRange

  // On the complete-months path these are the same cache entries as above.
  const basisTotals = useRangeTotals(basisRange)
  const basisExpense = useExpenseBreakdown(basisRange)
  const basisIncome = useIncomeBreakdown(basisRange, Boolean(categoryFilter))
  const basisMonthly = useMonthlyExpense(basisRange, categoryFilter)

  const reads = [
    windowExpense,
    comparableTotals,
    comparableExpense,
    comparableIncome,
    basisTotals,
    basisExpense,
    basisIncome,
    basisMonthly,
  ]
  const isError = isPreferencesError || boundsQuery.isError || reads.some((read) => read.isError)
  const isLoading =
    !isError && (isPreferencesPending || boundsQuery.isLoading || reads.some((read) => read.isPending))
  const retry = () => {
    void Promise.all([
      refetchPreferences(),
      boundsQuery.refetch(),
      ...reads.filter((read) => read.isError).map((read) => read.refetch()),
    ])
  }

  const categoryBreakdown = useMemo(
    () => categoryTotals(windowExpense.data, categoryFilter),
    [windowExpense.data, categoryFilter],
  )
  const totalSpending = Object.values(categoryBreakdown).reduce((sum, value) => sum + value, 0)

  const categoriesCount = Object.keys(categoryBreakdown).length
  const subcategoriesCount = useMemo(() => {
    const categories = windowExpense.data?.categories ?? {}
    return Object.entries(categories)
      .filter(([category]) => !categoryFilter || category === categoryFilter)
      .reduce((sum, [, entry]) => sum + Object.keys(entry.subcategories).length, 0)
  }, [windowExpense.data, categoryFilter])
  const topCategoryEntry = Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1])[0]
  const topCategory = topCategoryEntry?.[0] || 'N/A'
  const topCategoryAmount = topCategoryEntry?.[1] ?? 0

  // Income and the savings figure derived from it feed the budget-rule
  // PERCENTAGES, so both come off the basis window. Mixing a month whose salary
  // has not landed into the denominator is what produced the 1015% needs share
  // and a 0% savings share. On a category deep-link the income is the income
  // booked IN that category, as the row filter always meant.
  const totalIncome = categoryFilter
    ? (basisIncome.data?.categories[categoryFilter]?.total ?? 0)
    : (basisTotals.data?.total_income ?? 0)
  const basisCategoryTotals = useMemo(
    () => categoryTotals(basisExpense.data, categoryFilter),
    [basisExpense.data, categoryFilter],
  )
  const comparableSpending = Object.values(basisCategoryTotals).reduce((sum, value) => sum + value, 0)
  // Savings = income - spending - classified realised losses (the `/totals`
  // `net_savings` rule). A classified loss is out of spending but the cash left.
  const basisLosses = categoryFilter ? 0 : (basisTotals.data?.capital_losses ?? 0)
  const savings = spendingRuleSavings(totalIncome, comparableSpending + basisLosses)

  // Needs/Wants split is charted as a share of income, so it must sit on the
  // same basis as `totalIncome`.
  //
  // `essential_categories` goes through `resolveEssentialCategories` rather than
  // straight off the wire: the backend column default is the JSON string "[]",
  // so an unconfigured user sends `[]`, and an empty list would book 100% of
  // spend discretionary (0% needs on 50/30/20).
  const spendingBreakdown = useMemo(() => {
    if (!preferences) return null
    return splitEssentialSpend(
      basisCategoryTotals,
      resolveEssentialCategories(preferences.essential_categories),
    )
  }, [basisCategoryTotals, preferences])

  /**
   * Spend per month on the basis window, keyed `YYYY-MM`, only months that
   * carry spend (the spine below fills the gaps with real zero months).
   */
  const monthlyMap = useMemo(() => {
    const out: Record<string, number> = {}
    for (const [month, amount] of Object.entries(basisMonthly.data ?? {})) {
      if (amount > 0) out[month] = amount
    }
    return out
  }, [basisMonthly.data])

  /**
   * Per-month AVERAGE. Runs on complete months, so a 27-day month cannot count
   * as a full one in the divisor (real ledger, FY window on 2026-07-27:
   * 94,373.35 with the partial month vs 89,947.25 across the three complete
   * ones), and the divisor is every CALENDAR month in the window rather than
   * only the months that carry spend -- see `monthlySpendShape` for the measured
   * gap, which reaches 81% on a sparse category deep-link.
   *
   * `median` rides along for the subtitle: monthly spend is heavily skewed on
   * real data (all-time mean 43,190.00 against a median month of 12,101.31,
   * 3.6x), so the mean alone reads as a typical month when it is not.
   */
  const monthlySpend = useMemo(
    () =>
      monthlySpendShape(
        Object.entries(monthlyMap).map(([month, amount]) => ({ date: `${month}-01`, amount })),
        basisRange,
      ),
    [monthlyMap, basisRange],
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
   * A short window yields `undefined` rather than a 1- or 2-month mean labelled
   * "3-month rolling average" (measured on the real ledger's default FY window:
   * two of the three points were raw monthly spend redrawn as a trend), which
   * leaves FEWER average points than data points -- see `rollingAvgPointCount`.
   *
   * The series runs on a CONTIGUOUS month spine, the SAME one the "Monthly Avg"
   * KPI divides by ({@link spanMonthKeys}), because the chart draws that KPI as
   * its "Avg" reference line. A gappy list silently reached further back than 3
   * calendar months (2019-05 averaged Feb/Apr/May: 654.33 vs 521.00), and a
   * row-months-only spine put the line below every bar it claimed to average.
   */
  const monthlyTrendData = useMemo(() => {
    const withRows = Object.keys(monthlyMap).sort((a, b) => a.localeCompare(b))
    if (withRows.length === 0) return []
    const sorted = spanMonthKeys(withRows, basisRange).map((month) => ({
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
  }, [monthlyMap, basisRange])

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
   * `savings` here is income the user did not spend or lose, wherever it ended
   * up. `savings_target_percent` is the third leg of the 50/30/20 triplet and is
   * scored on /budgets against the NET CHANGE IN THE INVESTMENT PERIMETER --
   * money actually moved into SIP/PPF/EPF/NPS/stocks. Those are not the same
   * bar: on the real ledger for FY2025-26 the two numerators are 1,182,355.68
   * and 578,428.79 (see `pages/budget/BudgetPage.tsx`). Reading one preference
   * against both let /budgets report "under target" while this page reported
   * "on track" for the same user in the same period.
   *
   * `savings_goal_percent` is the app's income-minus-expenses target already:
   * the health score's "Spend Less Than Income" metric and the Trends
   * cumulative-savings-rate goal line both score it against this quantity.
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
