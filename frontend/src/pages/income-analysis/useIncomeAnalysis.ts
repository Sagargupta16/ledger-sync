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
import { ROLLING_AVG_MONTHS } from '@/lib/chartUtils'
import { dropPartialMonth } from '@/lib/dateUtils'
import { analysisPeriodLabel, resolveEarningStart } from '@/lib/finance/analysisPeriod'
import { computeIncomeMetrics } from '@/lib/finance/incomeMetrics'
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
  const savedEarningStart = resolveEarningStart(preferencesQuery.data?.earning_start_date, [])
  const needsEarningEvidence = savedEarningStart.source !== 'saved'
  // Focused read-only daily category aggregates, independent of chart/source
  // selection. A gift or refund cannot establish the employment boundary.
  const earningEvidenceQuery = useQuery({
    queryKey: ['earning-start-evidence'],
    queryFn: async () => (await calculationsApi.getCategoryDailySeries({ transaction_type: 'income' })).data.data,
    enabled: preferencesQuery.isSuccess && needsEarningEvidence,
    staleTime: Infinity,
  })
  const earningStart = useMemo(() => resolveEarningStart(
    preferencesQuery.data?.earning_start_date,
    (earningEvidenceQuery.data ?? []).map((row) => ({ ...row, type: 'Income' })),
  ), [preferencesQuery.data?.earning_start_date, earningEvidenceQuery.data])

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

  const {
    monthlyTrendData, rollingAvgPointCount, avgIncome, incomeSeries,
    peakIncome, growthRate, averagePeriod,
  } = useMemo(() => computeIncomeMetrics(income?.monthly_data ?? [], {
    earningStartDate: earningStart.date,
    startDate: dateRange.start_date,
    endDate: dateRange.end_date && dateBounds.maxDate
      ? (dateRange.end_date < dateBounds.maxDate ? dateRange.end_date : dateBounds.maxDate)
      : dateRange.end_date ?? dateBounds.maxDate,
  }), [income, earningStart.date, dateRange, dateBounds.maxDate])

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
    if (needsEarningEvidence && earningEvidenceQuery.isError) retries.push(earningEvidenceQuery.refetch())
    void Promise.all(retries)
  }

  return {
    isLoading:
      preferencesQuery.isPending || dateRangeQuery.isPending || incomeQuery.isPending ||
      (needsEarningEvidence && earningEvidenceQuery.isPending),
    isError: preferencesQuery.isError || dateRangeQuery.isError || incomeQuery.isError ||
      (needsEarningEvidence && earningEvidenceQuery.isError),
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
    earningsPeriodLabel: analysisPeriodLabel(averagePeriod),
    earningStart,
  }
}
