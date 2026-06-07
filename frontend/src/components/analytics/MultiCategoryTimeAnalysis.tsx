import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Download } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { CHART_COLORS_WARM } from '@/constants/chartColors'
import {
  bucketDate,
  calculateCumulativeData,
  formatBucketLabel,
  pickGranularity,
  type Granularity,
} from '@/lib/chartPeriodUtils'
import { MS_PER_DAY } from '@/lib/dateUtils'
import TimeSeriesLineChart from '@/components/analytics/TimeSeriesLineChart'
import { exportChartAsCsv } from '@/lib/exportCsv'

const COLORS = CHART_COLORS_WARM.slice(0, 6)

interface MultiCategoryTimeAnalysisProps {
  readonly dateRange?: { readonly start_date?: string; readonly end_date?: string }
}

export default function MultiCategoryTimeAnalysis({ dateRange }: MultiCategoryTimeAnalysisProps) {
  const [cumulative, setCumulative] = useState(true)
  const [granularityOverride, setGranularityOverride] = useState<Granularity | 'auto'>('auto')

  const { data: transactions } = useTransactions()

  // Process data for multi-category time analysis
  const { chartData, totalTransactions, granularity } = useMemo(() => {
    if (!transactions) return { chartData: [], totalTransactions: 0, granularity: 'day' as Granularity }

    const expenseTransactions = transactions.filter((t) => {
      if (t.type !== 'Expense') return false
      if (dateRange?.start_date) {
        const txDate = t.date.substring(0, 10)
        if (txDate < dateRange.start_date) return false
        if (dateRange.end_date && txDate > dateRange.end_date) return false
      }
      return true
    })

    if (expenseTransactions.length === 0) {
      return { chartData: [], totalTransactions: 0, granularity: 'day' as Granularity }
    }

    // Auto-pick granularity based on the actual data span so daily noise
    // doesn't drown the trend over multi-year ranges.
    const sortedDates = expenseTransactions
      .map((t) => t.date.substring(0, 10))
      .sort((a, b) => a.localeCompare(b))
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

    expenseTransactions.forEach((tx) => {
      const period = bucketDate(tx.date.substring(0, 10), gran)
      if (!groupedData[period]) groupedData[period] = {}
      if (!groupedData[period][tx.category]) groupedData[period][tx.category] = 0
      groupedData[period][tx.category] += Math.abs(tx.amount)
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
      totalTransactions: expenseTransactions.length,
      granularity: gran,
    }
  }, [transactions, dateRange, cumulative, granularityOverride])

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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7 }}
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-xl font-semibold text-white">Multi-Category Time Analysis</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {totalTransactions} expense transactions
              <span className="text-text-quaternary"> · </span>
              <span className="text-text-tertiary">
                bucketed {granularity === 'day' ? 'daily' : granularity === 'week' ? 'weekly' : 'monthly'}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
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
            >
              <option value="cumulative" className="bg-surface-dropdown text-foreground">Cumulative</option>
              <option value="regular" className="bg-surface-dropdown text-foreground">Regular</option>
            </select>

            {/* Export */}
            <button
              onClick={handleExport}
              className="p-2 bg-white/5 hover:bg-white/10 border border-border rounded-lg text-foreground transition-colors"
              type="button"
              title="Export chart"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Chart */}
        <TimeSeriesLineChart
          chartData={chartData}
          seriesKeys={topCategories}
          colors={COLORS}
        />
      </div>
    </motion.div>
  )
}
