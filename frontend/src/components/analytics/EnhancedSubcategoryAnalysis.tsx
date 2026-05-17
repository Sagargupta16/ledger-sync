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
  const [cumulative, setCumulative] = useState(true)
  const [granularityOverride, setGranularityOverride] = useState<Granularity | 'auto'>('auto')

  const { data: transactions } = useTransactions()

  // Get all expense categories for dropdown (filtered by dateRange)
  const categories = useMemo(() => {
    if (!transactions) return []
    const expenseCategories = new Set<string>()
    transactions.forEach((tx) => {
      if (tx.type !== 'Expense' || !tx.category) return
      if (dateRange?.start_date) {
        const txDate = tx.date.substring(0, 10)
        if (txDate < dateRange.start_date) return
        if (dateRange.end_date && txDate > dateRange.end_date) return
      }
      expenseCategories.add(tx.category)
    })
    return Array.from(expenseCategories).sort((a, b) => a.localeCompare(b))
  }, [transactions, dateRange])

  // Process subcategory data for selected category
  const { chartData, totalTransactions, granularity } = useMemo(() => {
    if (!transactions || !selectedCategory) {
      return { chartData: [], totalTransactions: 0, granularity: 'day' as Granularity }
    }

    const categoryTransactions = transactions.filter((tx) => {
      if (tx.type !== 'Expense' || tx.category !== selectedCategory) return false
      if (dateRange?.start_date) {
        const txDate = tx.date.substring(0, 10)
        if (txDate < dateRange.start_date) return false
        if (dateRange.end_date && txDate > dateRange.end_date) return false
      }
      return true
    })

    if (categoryTransactions.length === 0) {
      return { chartData: [], totalTransactions: 0, granularity: 'day' as Granularity }
    }

    // Auto-pick granularity to keep the chart legible across long ranges.
    const sortedDates = categoryTransactions
      .map((t) => t.date.substring(0, 10))
      .sort((a, b) => a.localeCompare(b))
    const spanDays = Math.max(
      1,
      Math.round(
        (new Date(sortedDates[sortedDates.length - 1]).valueOf() -
          new Date(sortedDates[0]).valueOf()) /
          86400000,
      ),
    )
    const gran =
      granularityOverride === 'auto' ? pickGranularity(spanDays) : granularityOverride

    const groupedData: Record<string, Record<string, number>> = {}

    categoryTransactions.forEach((tx) => {
      const period = bucketDate(tx.date.substring(0, 10), gran)
      const subcategory = tx.subcategory || 'Uncategorized'
      if (!groupedData[period]) groupedData[period] = {}
      if (!groupedData[period][subcategory]) groupedData[period][subcategory] = 0
      groupedData[period][subcategory] += Math.abs(tx.amount)
    })

    const subcategoryNames = new Set<string>()
    Object.values(groupedData).forEach((periodData) => {
      Object.keys(periodData).forEach((subcat) => subcategoryNames.add(subcat))
    })

    const allPeriods = Object.keys(groupedData).sort((a, b) => a.localeCompare(b))

    const data = allPeriods.map((period) => {
      const entry: Record<string, number | string> = {
        period,
        displayPeriod: formatBucketLabel(period, gran),
      }
      Array.from(subcategoryNames).forEach((subcat) => {
        entry[subcat] = groupedData[period]?.[subcat] || 0
      })
      return entry
    })

    const finalData = cumulative
      ? calculateCumulativeData(data, Array.from(subcategoryNames))
      : data

    return {
      chartData: finalData,
      totalTransactions: categoryTransactions.length,
      granularity: gran,
    }
  }, [transactions, selectedCategory, dateRange, cumulative, granularityOverride])

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
          <h3 className="text-xl font-semibold text-white">Enhanced Subcategory Analysis</h3>
          <button
            onClick={handleExport}
            className="p-2 bg-white/5 hover:bg-white/10 border border-border rounded-lg text-foreground transition-colors"
            type="button"
            title="Export chart"
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
            >
              <option value="cumulative" className="bg-surface-dropdown text-foreground">Cumulative</option>
              <option value="regular" className="bg-surface-dropdown text-foreground">Regular</option>
            </select>
          </div>

          <span className="text-xs text-muted-foreground">
            {totalTransactions} transactions
            <span className="text-text-quaternary"> · </span>
            <span className="text-text-tertiary">
              bucketed {granularity === 'day' ? 'daily' : granularity === 'week' ? 'weekly' : 'monthly'}
            </span>
          </span>
        </div>

        {/* Chart */}
        <TimeSeriesLineChart
          chartData={chartData}
          seriesKeys={subcategories}
          colors={[...COLORS]}
          legendFormatter={(value) => value.length > 20 ? `${value.substring(0, 17)}...` : value}
          emptyMessage={`No data available for ${selectedCategory}`}
        />
      </div>
    </motion.div>
  )
}
