import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Download } from 'lucide-react'
import { useCategoryBreakdown } from '@/hooks/api/useAnalytics'
import { calculationsApi } from '@/services/api/calculations'
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
import { exportChartAsCsv } from '@/lib/exportCsv'

const COLORS = CHART_COLORS_WARM

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
    categoryFilter ?? 'Food & Dining',
  )
  // Per-period by default so spend timing is visible (cumulative hides it).
  const [cumulative, setCumulative] = useState(false)
  const [granularityOverride, setGranularityOverride] = useState<Granularity | 'auto'>('auto')

  // Category dropdown list from the (date-scoped) category breakdown rollup.
  const { data: categoryData } = useCategoryBreakdown({
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
  const { data: series } = useQuery({
    queryKey: [
      'category-daily-series',
      'expense',
      selectedCategory,
      dateRange?.start_date,
      dateRange?.end_date,
    ],
    queryFn: async () =>
      (
        await calculationsApi.getCategoryDailySeries({
          transaction_type: 'expense',
          category: selectedCategory,
          start_date: dateRange?.start_date,
          end_date: dateRange?.end_date,
        })
      ).data,
    enabled: Boolean(selectedCategory),
    staleTime: Infinity,
  })

  // Process subcategory data for selected category
  const { chartData, totalTransactions, granularity } = useMemo(() => {
    const rows = series?.data ?? []
    if (rows.length === 0) {
      return { chartData: [], totalTransactions: 0, granularity: 'day' as Granularity }
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

  return (
    <motion.div
      className="glass p-6 rounded-xl border border-border"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-foreground">Enhanced Subcategory Analysis</h3>
          <button
            onClick={handleExport}
            className="p-2.5 min-h-11 bg-[var(--overlay-2)] hover:bg-[var(--overlay-5)] border border-border rounded-lg text-foreground transition-colors"
            type="button"
            title="Export chart"
            aria-label="Export chart as CSV"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Category Dropdown */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-app-purple/50 min-w-50"
              aria-label="Category to analyze"
            >
              {categories.map((category) => (
                <option key={category} value={category} className="bg-surface-dropdown text-foreground">
                  {category}
                </option>
              ))}
            </select>

            {/* Granularity */}
            <select
              value={granularityOverride}
              onChange={(e) => setGranularityOverride(e.target.value as Granularity | 'auto')}
              className="px-3 py-1.5 bg-surface-dropdown/80 border border-border rounded-lg text-foreground text-sm focus:outline-none"
              aria-label="Time granularity"
            >
              <option value="auto" className="bg-surface-dropdown text-foreground">Auto</option>
              <option value="day" className="bg-surface-dropdown text-foreground">Daily</option>
              <option value="week" className="bg-surface-dropdown text-foreground">Weekly</option>
              <option value="month" className="bg-surface-dropdown text-foreground">Monthly</option>
            </select>

            {/* Cumulative Toggle */}
            <select
              value={cumulative ? 'cumulative' : 'regular'}
              onChange={(e) => setCumulative(e.target.value === 'cumulative')}
              className="px-3 py-1.5 bg-surface-dropdown/80 border border-border rounded-lg text-foreground text-sm focus:outline-none"
              aria-label="Cumulative or regular totals"
            >
              <option value="cumulative" className="bg-surface-dropdown text-foreground">Cumulative</option>
              <option value="regular" className="bg-surface-dropdown text-foreground">Regular</option>
            </select>
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
        <div role="img" aria-label={`Line chart of subcategory spending over time within ${selectedCategory}`}>
          <TimeSeriesLineChart
            chartData={chartData}
            seriesKeys={subcategories}
            colors={[...COLORS]}
            legendFormatter={(value) => value.length > 20 ? `${value.substring(0, 17)}...` : value}
            emptyMessage={`No data available for ${selectedCategory}`}
          />
        </div>
      </div>
    </motion.div>
  )
}
