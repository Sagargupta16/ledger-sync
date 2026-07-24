import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Download } from 'lucide-react'
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
import { Button, Select } from '@/components/ui'
import { exportChartAsCsv } from '@/lib/exportCsv'

const COLORS = CHART_COLORS_WARM.slice(0, 6)
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

interface MultiCategoryTimeAnalysisProps {
  readonly dateRange?: { readonly start_date?: string; readonly end_date?: string }
}

export default function MultiCategoryTimeAnalysis({ dateRange }: MultiCategoryTimeAnalysisProps) {
  // Default to per-period (non-cumulative) so the chart shows WHEN spending
  // happened; cumulative fans upward and hides the timing. Toggle still available.
  const [cumulative, setCumulative] = useState(false)
  const [granularityOverride, setGranularityOverride] = useState<Granularity | 'auto'>('auto')

  // Daily per-category sums, aggregated server-side (date-range applied in SQL).
  // The client keeps its own day/week/month bucketing so the ISO-week + label
  // logic is unchanged -- we just feed it daily rows instead of the full ledger.
  const { data: series } = useQuery({
    queryKey: ['category-daily-series', 'expense', dateRange?.start_date, dateRange?.end_date],
    queryFn: async () =>
      (
        await calculationsApi.getCategoryDailySeries({
          transaction_type: 'expense',
          start_date: dateRange?.start_date,
          end_date: dateRange?.end_date,
        })
      ).data,
    staleTime: Infinity,
  })

  // Process data for multi-category time analysis
  const { chartData, totalTransactions, granularity } = useMemo(() => {
    const rows = series?.data ?? []
    if (rows.length === 0) {
      return { chartData: [], totalTransactions: 0, granularity: 'day' as Granularity }
    }

    // Auto-pick granularity based on the actual data span so daily noise
    // doesn't drown the trend over multi-year ranges.
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
      if (!groupedData[period]) groupedData[period] = {}
      if (!groupedData[period][row.category]) groupedData[period][row.category] = 0
      groupedData[period][row.category] += row.amount
    })

    // Get top 6 categories by total spending
    const categoryTotals: Record<string, number> = {}
    Object.values(groupedData).forEach((periodData) => {
      Object.entries(periodData).forEach(([category, amount]) => {
        categoryTotals[category] = (categoryTotals[category] || 0) + amount
      })
    })

    const topCategories = Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([category]) => category)

    const allPeriods = Object.keys(groupedData).sort((a, b) => a.localeCompare(b))

    const data = allPeriods.map((period) => {
      const entry: Record<string, number | string> = {
        period,
        displayPeriod: formatBucketLabel(period, gran),
      }
      topCategories.forEach((category) => {
        entry[category] = groupedData[period]?.[category] || 0
      })
      return entry
    })

    const finalData = cumulative ? calculateCumulativeData(data, topCategories) : data

    return {
      chartData: finalData,
      totalTransactions: series?.transaction_count ?? 0,
      granularity: gran,
    }
  }, [series, cumulative, granularityOverride])

  const topCategories = useMemo(() => {
    if (chartData.length === 0) return []
    const firstEntry = chartData[0]
    return Object.keys(firstEntry).filter((key) => key !== 'period' && key !== 'displayPeriod')
  }, [chartData])

  const handleExport = () => {
    exportChartAsCsv('multi-category-analysis.csv', topCategories, chartData)
  }

  return (
    <motion.div
      className="glass p-6 rounded-xl border border-border"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-xl font-semibold text-foreground">Multi-Category Time Analysis</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {totalTransactions} expense transactions
              <span className="text-text-quaternary"> · </span>
              <span className="text-text-tertiary">
                bucketed {granularityAdverb(granularity)}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
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

            {/* Export */}
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
        </div>

        {/* Chart */}
        <div role="img" aria-label="Line chart of spending over time for the top expense categories">
          <TimeSeriesLineChart
            chartData={chartData}
            seriesKeys={topCategories}
            colors={COLORS}
          />
        </div>
      </div>
    </motion.div>
  )
}
