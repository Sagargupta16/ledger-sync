import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Download } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { formatCurrency, formatCurrencyShort, formatDateTick } from '@/lib/formatters'
import { CHART_COLORS_WARM, CHART_AXIS_COLOR, CHART_GRID_COLOR } from '@/constants/chartColors'
import { chartTooltipProps } from '@/components/ui'
import { useTimeNavigation } from '@/hooks/useTimeNavigation'
import { calculateCumulativeData } from '@/lib/chartPeriodUtils'
import TimeNavigationControls from '@/components/analytics/TimeNavigationControls'

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
    const csvRows = ['Period,' + topCategories.join(',')]
    chartData.forEach((entry) => {
      const values = topCategories.map((c) => entry[c] ?? 0)
      csvRows.push(entry.displayPeriod + ',' + values.join(','))
    })
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'multi-category-analysis.csv'
    a.click()
    URL.revokeObjectURL(url)
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
        {chartData.length > 0 && topCategories.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
              <XAxis
                dataKey="displayPeriod"
                stroke={CHART_AXIS_COLOR}
                tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
                tickFormatter={(v) => formatDateTick(v, chartData.length)}
                angle={-45}
                textAnchor="end"
                height={80}
                interval={Math.max(1, Math.floor(chartData.length / 20))}
              />
              <YAxis
                stroke={CHART_AXIS_COLOR}
                tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
                tickFormatter={(value) => formatCurrencyShort(value)}
              />
              <Tooltip
                {...chartTooltipProps}
                labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              {topCategories.map((category, index) => (
                <Line
                  key={category}
                  type="natural"
                  dataKey={category}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={chartData.length < 500}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-100 flex items-center justify-center text-muted-foreground">No data available</div>
        )}
      </div>
    </motion.div>
  )
}
