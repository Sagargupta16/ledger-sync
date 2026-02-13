import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Download } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { CHART_COLORS_WARM } from '@/constants/chartColors'
import { useTimeNavigation } from '@/hooks/useTimeNavigation'
import { calculateCumulativeData } from '@/lib/chartPeriodUtils'
import TimeNavigationControls from '@/components/analytics/TimeNavigationControls'
import TimeSeriesLineChart, { exportChartAsCsv } from '@/components/analytics/TimeSeriesLineChart'

const COLORS = CHART_COLORS_WARM.slice(0, 8) // Use first 8 colors

export default function MultiCategoryTimeAnalysis() {
  const {
    viewMode, setViewMode, currentYear, currentMonth,
    handlePrevYear, handleNextYear, handlePrevMonth, handleNextMonth,
  } = useTimeNavigation()
  const [cumulative, setCumulative] = useState(true)

  const { data: transactions } = useTransactions()

  // Process data for multi-category time analysis
  const { chartData, totalTransactions } = useMemo(() => {
    if (!transactions) return { chartData: [], totalTransactions: 0 }

    const expenseTransactions = transactions.filter((t) => {
      if (t.type !== 'Expense') return false
      if (viewMode === 'yearly') {
        const txYear = Number.parseInt(t.date.substring(0, 4))
        return txYear === currentYear
      }
      if (viewMode === 'monthly') {
        return t.date.substring(0, 7) === currentMonth
      }
      return true // all_time
    })

    const groupedData: Record<string, Record<string, number>> = {}

    expenseTransactions.forEach((tx) => {
      const period = tx.date.substring(0, 10) // YYYY-MM-DD (always daily)

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

    // Sort all dates chronologically
    const allPeriods = Object.keys(groupedData).sort((a, b) => a.localeCompare(b))

    const data = allPeriods.map((period) => {
      const entry: Record<string, number | string> = { period, displayPeriod: period }
      topCategories.forEach((category) => {
        entry[category] = groupedData[period]?.[category] || 0
      })
      return entry
    })

    // Calculate cumulative if needed
    const finalData = cumulative ? calculateCumulativeData(data, topCategories) : data

    return {
      chartData: finalData,
      totalTransactions: expenseTransactions.length,
    }
  }, [transactions, viewMode, currentYear, currentMonth, cumulative])

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
      className="glass p-6 rounded-xl border border-white/10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7 }}
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-white">Multi-Category Time Analysis</h3>
          <button
            onClick={handleExport}
            className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-300 transition-colors"
            type="button"
            title="Export chart"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>

        {/* View Controls and Year Navigation */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex gap-2">
            {/* View Mode Toggle */}
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as 'monthly' | 'yearly')}
              className="px-3 py-1.5 bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-300 text-sm focus:outline-none"
            >
              <option value="monthly" className="bg-gray-800 text-gray-200">Monthly View</option>
              <option value="yearly" className="bg-gray-800 text-gray-200">Yearly View</option>
            </select>

            {/* Cumulative Toggle */}
            <select
              value={cumulative ? 'cumulative' : 'regular'}
              onChange={(e) => setCumulative(e.target.value === 'cumulative')}
              className="px-3 py-1.5 bg-gray-800/80 border border-white/10 rounded-lg text-gray-200 text-sm focus:outline-none"
            >
              <option value="cumulative" className="bg-gray-800 text-gray-200">Cumulative</option>
              <option value="regular" className="bg-gray-800 text-gray-200">Regular</option>
            </select>
          </div>

          {/* Navigation */}
          <TimeNavigationControls
            viewMode={viewMode}
            currentYear={currentYear}
            currentMonth={currentMonth}
            totalTransactions={totalTransactions}
            transactionLabel="expense transactions"
            handlePrevYear={handlePrevYear}
            handleNextYear={handleNextYear}
            handlePrevMonth={handlePrevMonth}
            handleNextMonth={handleNextMonth}
          />
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
