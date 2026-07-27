import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useQuery } from '@tanstack/react-query'

import { dataDateRangeOptions } from '@/hooks/api/useAnalytics'
import { usePreferences } from '@/hooks/api/usePreferences'
import {
  hasNoCompleteMonthBasis,
  useAnalyticsTimeFilter,
} from '@/hooks/useAnalyticsTimeFilter'
import { rawColors } from '@/constants/colors'
import { ROLLING_AVG_MONTHS, countRollingAvgPoints } from '@/lib/chartUtils'
import { dropPartialMonth, formatMonthKey } from '@/lib/dateUtils'
import { percentChange } from '@/lib/formatters'
import { INCOME_CATEGORY_COLORS } from '@/lib/preferencesUtils'
import { calculationsApi } from '@/services/api/calculations'
import { resolveIncomeClassification } from '@/store/preferencesStore'

export interface IncomeCategoryDatum {
  readonly name: string
  readonly category: string
  readonly value: number
  readonly color: string
}

export interface MonthlyIncomeDatum {
  readonly month: string
  readonly label: string
  readonly income: number
  /**
   * `undefined` for the leading months with no full rolling window behind them.
   * Recharts skips undefined points, which is what keeps the "3m avg" line from
   * claiming a 1- or 2-month mean is a 3-month one.
   */
  readonly incomeAvg: number | undefined
}

export function useIncomeAnalysis() {
  const [searchParams, setSearchParams] = useSearchParams()
  const categoryFilter = searchParams.get('category')
  const preferencesQuery = usePreferences()
  const dateRangeQuery = useQuery(dataDateRangeOptions())

  const dateBounds = useMemo(
    () => ({
      minDate: dateRangeQuery.data?.min_date ?? undefined,
      maxDate: dateRangeQuery.data?.max_date ?? undefined,
    }),
    [dateRangeQuery.data],
  )
  const { dateRange, partialPeriod, isRangePartialOnly, timeFilterProps } =
    useAnalyticsTimeFilter(dateBounds)
  // The backend matches cashbacks against exactly this list and owns no
  // preference fallback of its own (`cashback_categories or []` in
  // calculations.py), so sending the raw wire value meant an unconfigured user
  // -- whose column default is the JSON string "[]" -- got a cashback total of 0.
  // Resolve the group here so the sent list carries the shipped defaults.
  const cashbackCategories = useMemo(
    () =>
      preferencesQuery.data
        ? resolveIncomeClassification(preferencesQuery.data).nonTaxable
        : [],
    [preferencesQuery.data],
  )

  const incomeQuery = useQuery({
    queryKey: [
      'income-analysis',
      dateRange.start_date,
      dateRange.end_date,
      categoryFilter,
      cashbackCategories,
    ],
    queryFn: async () =>
      (
        await calculationsApi.getIncomeAnalysis({
          start_date: dateRange.start_date ?? undefined,
          end_date: dateRange.end_date ?? undefined,
          category: categoryFilter ?? undefined,
          cashback_categories: cashbackCategories,
        })
      ).data,
    enabled: preferencesQuery.isSuccess && dateRangeQuery.isSuccess,
    staleTime: Infinity,
  })

  const income = incomeQuery.data
  const totalIncome = income?.total_income ?? 0
  const cashbacksTotal = income?.cashbacks_total ?? 0

  const incomeTypeChartData = useMemo<IncomeCategoryDatum[]>(() => {
    const defaultColor = rawColors.text.tertiary
    return Object.entries(income?.category_breakdown ?? {})
      .filter(([, value]) => value > 0)
      .map(([category, value]) => ({
        name: category,
        category,
        value,
        color: INCOME_CATEGORY_COLORS[category] || defaultColor,
      }))
      .sort((a, b) => b.value - a.value)
  }, [income])

  const primaryIncomeType = incomeTypeChartData[0]?.name || 'N/A'
  const primaryIncomeValue = incomeTypeChartData[0]?.value ?? 0
  const primaryShare = totalIncome > 0 ? (primaryIncomeValue / totalIncome) * 100 : 0
  const cashbackShare = totalIncome > 0 ? (cashbacksTotal / totalIncome) * 100 : 0

  /**
   * Month-by-month income for the trend chart, averages and growth rate.
   *
   * The in-progress month is dropped: salary lands late in the month, so on the
   * real ledger July showed 9,911 against ~226k-267k for Apr-Jun. Charted as a
   * peer that reads as income collapsing, and the numbers derived from it were
   * flatly wrong -- growth rate -95.6% (true: +18.1%) and average monthly income
   * 181,968 (true: 239,320). This is a rates-and-averages surface end to end;
   * the period TOTAL (`totalIncome`) still counts the partial month.
   *
   * When the drop empties the series -- one month of history on the default
   * all-time view, or a `?category=X` source whose only rows are this month --
   * the partial month is KEPT rather than charting nothing. Everything derived
   * from it then abstains (`growthRate`/`peakIncome` come back `undefined`) so
   * the cards render a dash instead of a confident 0% beside a real total.
   */
  const hasPartialOnlyBasis = useMemo(
    () =>
      hasNoCompleteMonthBasis(
        isRangePartialOnly,
        dropPartialMonth(income?.monthly_data ?? [], 'month').length,
      ) && (income?.monthly_data?.length ?? 0) > 0,
    [income, isRangePartialOnly],
  )

  const monthlyTrendData = useMemo<MonthlyIncomeDatum[]>(() => {
    const complete = dropPartialMonth(income?.monthly_data ?? [], 'month')
    const basis = complete.length > 0 ? complete : (income?.monthly_data ?? [])
    return basis.map((datum) => ({
      month: datum.month,
      label: formatMonthKey(datum.month, { month: 'short', year: '2-digit' }),
      income: datum.income,
      // `null` -> `undefined`: recharts treats only `undefined` (and `null`) as a
      // gap, and the shared count/caption helpers accept either.
      incomeAvg: datum.income_avg_3m ?? undefined,
    }))
  }, [income])

  /**
   * How many rolling-average points the chart can actually draw. Dropping the
   * partial month can strip the only complete window, and the leading months
   * never had one, so this is regularly 0 or 1 -- and 1 paints nothing unless
   * the chart switches to a dot. Same contract as Spending Analysis and Trends.
   */
  const rollingAvgPointCount = useMemo(
    () => countRollingAvgPoints(monthlyTrendData, (datum) => datum.incomeAvg),
    [monthlyTrendData],
  )

  const avgIncome = useMemo(() => {
    if (monthlyTrendData.length === 0) return 0
    return (
      monthlyTrendData.reduce((sum, datum) => sum + datum.income, 0) /
      monthlyTrendData.length
    )
  }, [monthlyTrendData])

  const incomeSeries = useMemo(
    () => monthlyTrendData.map((datum) => datum.income),
    [monthlyTrendData],
  )

  /**
   * Peak monthly income, or `undefined` when the only month available is the one
   * in progress -- a partial month's running total is not a peak.
   */
  const peakIncome = useMemo(
    () =>
      hasPartialOnlyBasis || incomeSeries.length === 0
        ? undefined
        : Math.max(...incomeSeries),
    [hasPartialOnlyBasis, incomeSeries],
  )

  /**
   * First-to-last growth over complete months, or `undefined` when there are not
   * two complete months to compare. The backend's `growth_rate` runs over every
   * month it was given, so a window ending mid-month made the last point a stub
   * and the rate a cliff -- but returning 0 in its place was its own lie: the
   * card read a definite "0%" growth next to a real total. Abstain instead.
   */
  const growthRate = useMemo(() => {
    if (hasPartialOnlyBasis) return undefined
    const nonZero = incomeSeries.filter((value) => value > 0)
    if (nonZero.length < 2) return undefined
    return percentChange(nonZero[nonZero.length - 1], nonZero[0]) ?? undefined
  }, [hasPartialOnlyBasis, incomeSeries])

  const clearCategoryFilter = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('category')
    setSearchParams(next, { replace: true })
  }

  const retry = () => {
    const retries: Array<Promise<unknown>> = []
    if (preferencesQuery.isError) retries.push(preferencesQuery.refetch())
    if (dateRangeQuery.isError) retries.push(dateRangeQuery.refetch())
    if (incomeQuery.isError) retries.push(incomeQuery.refetch())
    void Promise.all(retries)
  }

  return {
    isLoading:
      preferencesQuery.isPending || dateRangeQuery.isPending || incomeQuery.isPending,
    isError: preferencesQuery.isError || dateRangeQuery.isError || incomeQuery.isError,
    retry,
    categoryFilter,
    clearCategoryFilter,
    dateRange,
    partialPeriod,
    noCompleteMonthBasis: hasPartialOnlyBasis,
    timeFilterProps,
    totalIncome,
    cashbacksTotal,
    peakIncome,
    growthRate,
    primaryIncomeType,
    primaryShare,
    cashbackShare,
    incomeTypeChartData,
    monthlyTrendData,
    rollingAvgPointCount,
    rollingAvgMonths: ROLLING_AVG_MONTHS,
    avgIncome,
    incomeSeries,
  }
}
