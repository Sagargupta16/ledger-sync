import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useQuery } from '@tanstack/react-query'

import { dataDateRangeOptions } from '@/hooks/api/useAnalytics'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'
import { rawColors } from '@/constants/colors'
import { formatMonthKey } from '@/lib/dateUtils'
import { INCOME_CATEGORY_COLORS } from '@/lib/preferencesUtils'
import { calculationsApi } from '@/services/api/calculations'

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
  readonly incomeAvg: number
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
  const { dateRange, timeFilterProps } = useAnalyticsTimeFilter(dateBounds)
  const cashbackCategories = preferencesQuery.data?.non_taxable_income_categories ?? []

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
  const peakIncome = income?.peak_income ?? 0
  const growthRate = income?.growth_rate ?? 0

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

  const monthlyTrendData = useMemo<MonthlyIncomeDatum[]>(
    () =>
      (income?.monthly_data ?? []).map((datum) => ({
        month: datum.month,
        label: formatMonthKey(datum.month, { month: 'short', year: '2-digit' }),
        income: datum.income,
        incomeAvg: datum.income_avg_3m,
      })),
    [income],
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
    avgIncome,
    incomeSeries,
  }
}
