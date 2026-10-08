import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Download } from 'lucide-react'
import { useCategoryBreakdown } from '@/hooks/api/useAnalytics'
import {
  DEFAULT_SUBCATEGORY_FOCUS,
  expenseCategoryDailySeriesOptions,
} from '@/components/analytics/categoryDailySeriesQueries'
import { CHART_COLORS_WARM } from '@/constants/chartColors'
import {
  bucketDate,
  calculateCumulativeData,
  formatBucketLabel,
  granularityAdverb,
  pickGranularity,
  type Granularity,
} from '@/lib/chartPeriodUtils'
import { MS_PER_DAY } from '@/lib/dateUtils'
import TimeSeriesLineChart from '@/components/analytics/TimeSeriesLineChart'
import ErrorState from '@/components/shared/ErrorState'
import LoadingSkeleton, { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import { Button, Select } from '@/components/ui'
import { exportChartAsCsv } from '@/lib/exportCsv'

const COLORS = CHART_COLORS_WARM
const GRANULARITY_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
]
const TOTAL_MODE_OPTIONS = [
  { value: 'cumulative', label: 'Cumulative' },
  { value: 'regular', label: 'Regular' },
]

interface EnhancedSubcategoryAnalysisProps {
  readonly dateRange?: { readonly start_date?: string; readonly end_date?: string }
  /**
   * When set, overrides the user's category dropdown selection so the
   * subcategory analysis matches a deep-link drill-down. The dropdown
   * stays interactive afterwards -- this is just the initial value.
   */
  readonly categoryFilter?: string | null
}

export default function EnhancedSubcategoryAnalysis({ dateRange, categoryFilter }: EnhancedSubcategoryAnalysisProps) {
  // Initial value reflects the URL filter when present. Callers re-mount
  // this component (via key={categoryFilter ?? 'all'}) when the filter
  // changes externally, so we don't need a useEffect sync that tripped
  // the rules-of-hooks "setState in effect" check.
  const [selectedCategory, setSelectedCategory] = useState<string>(
    categoryFilter ?? DEFAULT_SUBCATEGORY_FOCUS,
  )
  // Per-period by default so spend timing is visible (cumulative hides it).
  const [cumulative, setCumulative] = useState(false)
  const [granularityOverride, setGranularityOverride] = useState<Granularity | 'auto'>('auto')

  // Category dropdown list from the (date-scoped) category breakdown rollup.
  const {
    data: categoryData,
    isLoading: isCategoriesLoading,
    isError: isCategoriesError,
    refetch: refetchCategories,
  } = useCategoryBreakdown({
    transaction_type: 'expense',
    start_date: dateRange?.start_date,
    end_date: dateRange?.end_date,
  })
  const categories = useMemo(
    () => Object.keys(categoryData?.categories ?? {}).sort((a, b) => a.localeCompare(b)),
    [categoryData],
  )

  // Daily per-subcategory sums for the selected category, aggregated
  // server-side (date range + category filter in SQL). Client keeps its own
  // day/week/month bucketing so the ISO-week + label logic is unchanged.
  const {
    data: series,
    isLoading: isSeriesLoading,
    isError: isSeriesError,
    refetch: refetchSeries,
  } = useQuery({
    // Shared with the Expense Analysis page, which reads the opening category
    // for a newly selected window before handing that window down.
    ...expenseCategoryDailySeriesOptions(selectedCategory, dateRange),
    enabled: Boolean(selectedCategory),
  })

  // Process subcategory data for selected category
  const { chartData, totalTransactions, granularity } = useMemo(() => {
    const rows = series?.data ?? []
    if (rows.length === 0) {
      const granularity: Granularity = 'day'
      return { chartData: [], totalTransactions: 0, granularity }
    }

    // Auto-pick granularity to keep the chart legible across long ranges.
    const sortedDates = rows.map((r) => r.date).sort((a, b) => a.localeCompare(b))
    const spanDays = Math.max(
      1,
      Math.round(
        (new Date(sortedDates[sortedDates.length - 1]).valueOf() -
          new Date(sortedDates[0]).valueOf()) /
          MS_PER_DAY,
      ),
    )
    const gran =
      granularityOverride === 'auto' ? pickGranularity(spanDays) : granularityOverride

    const groupedData: Record<string, Record<string, number>> = {}

    rows.forEach((row) => {
      const period = bucketDate(row.date, gran)
      const subcategory = row.subcategory || 'Uncategorized'
      if (!groupedData[period]) groupedData[period] = {}
      if (!groupedData[period][subcategory]) groupedData[period][subcategory] = 0
      groupedData[period][subcategory] += row.amount
    })

    // Cap to the top 6 subcategories by total spend, folding the rest into a
    // single "Other" series. Without a cap a busy category renders 15+ lines
    // (spaghetti); 6 + Other stays legible.
    const SUBCAT_TOP_N = 6
    const totalsBySubcat = new Map<string, number>()
    Object.values(groupedData).forEach((periodData) => {
      Object.entries(periodData).forEach(([subcat, amount]) => {
        totalsBySubcat.set(subcat, (totalsBySubcat.get(subcat) ?? 0) + amount)
      })
    })
    const rankedSubcats = [...totalsBySubcat.entries()].sort((a, b) => b[1] - a[1])
    const topSubcats = rankedSubcats.slice(0, SUBCAT_TOP_N).map(([name]) => name)
    const hasOther = rankedSubcats.length > SUBCAT_TOP_N
    const topSet = new Set(topSubcats)
    const subcategoryNames = hasOther ? [...topSubcats, 'Other'] : topSubcats

    const allPeriods = Object.keys(groupedData).sort((a, b) => a.localeCompare(b))

    const data = allPeriods.map((period) => {
      const entry: Record<string, number | string> = {
        period,
        displayPeriod: formatBucketLabel(period, gran),
      }
      for (const name of subcategoryNames) entry[name] = 0
      Object.entries(groupedData[period] ?? {}).forEach(([subcat, amount]) => {
        const bucket = topSet.has(subcat) ? subcat : 'Other'
        entry[bucket] = (entry[bucket] as number) + amount
      })
      return entry
    })

    const finalData = cumulative ? calculateCumulativeData(data, subcategoryNames) : data

    return {
      chartData: finalData,
      totalTransactions: series?.transaction_count ?? 0,
      granularity: gran,
    }
  }, [series, cumulative, granularityOverride])

  const subcategories = useMemo(() => {
    if (chartData.length === 0) return []
    const firstEntry = chartData[0]
    return Object.keys(firstEntry).filter((key) => key !== 'period' && key !== 'displayPeriod')
  }, [chartData])

  const handleExport = () => {
    exportChartAsCsv(`subcategory-analysis-${selectedCategory}.csv`, subcategories, chartData)
  }

  if (isCategoriesLoading) return <ChartSkeleton height="h-80" />

  if (isCategoriesError) {
    return (
      <ErrorState
        variant="card"
        title="Unable to load subcategory trend"
        message="Your spending categories couldn't be loaded. Try again to compare subcategories."
        onRetry={() => { void refetchCategories() }}
      />
    )
  }

  let chart = (
    <TimeSeriesLineChart
      chartData={chartData}
      seriesKeys={subcategories}
      colors={[...COLORS]}
      legendFormatter={(value) => value.length > 20 ? `${value.substring(0, 17)}...` : value}
      emptyMessage={`No data available for ${selectedCategory}`}
      ariaLabel={`Line chart of subcategory spending over time within ${selectedCategory}`}
    />
  )
  if (isSeriesLoading) {
    chart = (
      <output aria-busy="true" className="block">
        <span className="sr-only">Loading {selectedCategory} subcategory trend</span>
        <LoadingSkeleton className="h-100 w-full" />
      </output>
    )
  } else if (isSeriesError) {
    chart = (
      <ErrorState
        variant="compact"
        title={`Unable to load ${selectedCategory}`}
        message="This category's daily spending couldn't be loaded. Try again or pick another category."
        onRetry={() => { void refetchSeries() }}
      />
    )
  }

  return (
    <motion.div
      className="ledger-panel p-4 sm:p-5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Subcategory trend</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Compare the largest subcategories inside one spending category.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            type="button"
            title="Export chart"
            aria-label="Export chart as CSV"
            className="p-0"
          >
            <Download className="size-4" aria-hidden="true" />
          </Button>
        </div>

        {/* Controls Row */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-3">
            {/* Category Dropdown */}
            <Select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              options={categories.map((category) => ({ value: category, label: category }))}
              className="min-w-0 sm:min-w-50"
              aria-label="Category to analyze"
            />

            {/* Granularity */}
            <Select
              value={granularityOverride}
              onChange={(e) => setGranularityOverride(e.target.value as Granularity | 'auto')}
              options={GRANULARITY_OPTIONS}
              aria-label="Time granularity"
            />

            {/* Cumulative Toggle */}
            <Select
              value={cumulative ? 'cumulative' : 'regular'}
              onChange={(e) => setCumulative(e.target.value === 'cumulative')}
              options={TOTAL_MODE_OPTIONS}
              aria-label="Cumulative or regular totals"
            />
          </div>

          <span className="text-xs text-muted-foreground">
            {totalTransactions} transactions
            <span className="text-text-quaternary"> · </span>
            <span className="text-text-tertiary">
              bucketed {granularityAdverb(granularity)}
            </span>
          </span>
        </div>

        {/* Chart */}
        {chart}
      </div>
    </motion.div>
  )
}
