import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Download } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { CHART_COLORS_WARM, CHART_AXIS_COLOR, CHART_GRID_COLOR } from '@/constants/chartColors'
import { chartTooltipProps } from '@/components/ui'
import { useTimeNavigation } from '@/hooks/useTimeNavigation'
import { generateAllPeriods, formatDisplayPeriod, calculateCumulativeData } from '@/lib/chartPeriodUtils'
import TimeNavigationControls from '@/components/analytics/TimeNavigationControls'

const COLORS = CHART_COLORS_WARM

export default function EnhancedSubcategoryAnalysis() {
  const [selectedCategory, setSelectedCategory] = useState<string>('Food & Dining')
  const {
    viewMode, setViewMode, currentYear, currentMonth,
    handlePrevYear, handleNextYear, handlePrevMonth, handleNextMonth,
  } = useTimeNavigation()
  const [cumulative, setCumulative] = useState(true)

  const { data: transactions } = useTransactions()

  // Get all expense categories for dropdown
  const categories = useMemo(() => {
    if (!transactions) return []
    const expenseCategories = new Set<string>()
    transactions.forEach((tx) => {
      if (tx.type === 'Expense' && tx.category) {
        expenseCategories.add(tx.category)
      }
    })
    return Array.from(expenseCategories).sort((a, b) => a.localeCompare(b))
  }, [transactions])

  // Process subcategory data for selected category
  const { chartData, totalTransactions } = useMemo(() => {
    if (!transactions || !selectedCategory) return { chartData: [], totalTransactions: 0 }

    // Filter transactions for selected category
    const categoryTransactions = transactions.filter((tx) => {
      if (tx.type !== 'Expense' || tx.category !== selectedCategory) return false
      if (viewMode === 'yearly') {
        const txYear = Number.parseInt(tx.date.substring(0, 4))
        return txYear === currentYear
      }
      if (viewMode === 'monthly') {
        return tx.date.substring(0, 7) === currentMonth
      }
      return true // all_time
    })

    const groupedData: Record<string, Record<string, number>> = {}

    categoryTransactions.forEach((tx) => {
      let period: string
      if (viewMode === 'monthly') {
        period = tx.date.substring(8, 10) // DD (day of month)
      } else if (viewMode === 'yearly') {
        period = tx.date.substring(5, 7) // MM (month)
      } else {
        // all_time: use quarterly format YYYY-Q1, YYYY-Q2, etc.
        const year = tx.date.substring(0, 4)
        const month = Number.parseInt(tx.date.substring(5, 7))
        const quarter = Math.ceil(month / 3)
        period = `${year}-Q${quarter}`
      }

      const subcategory = tx.subcategory || 'Uncategorized'

      if (!groupedData[period]) groupedData[period] = {}
      if (!groupedData[period][subcategory]) groupedData[period][subcategory] = 0

      groupedData[period][subcategory] += Math.abs(tx.amount)
    })

    // Get all unique subcategories
    const subcategories = new Set<string>()
    Object.values(groupedData).forEach((periodData) => {
      Object.keys(periodData).forEach((subcat) => subcategories.add(subcat))
    })

    // Convert to array format with all periods
    const allPeriods = generateAllPeriods(viewMode, currentMonth, groupedData)

    const data = allPeriods.map((period) => {
      const displayPeriod = formatDisplayPeriod(period, viewMode, currentYear)
      const entry: Record<string, number | string> = { period, displayPeriod }

      Array.from(subcategories).forEach((subcat) => {
        entry[subcat] = groupedData[period]?.[subcat] || 0
      })

      return entry
    })

    // Calculate cumulative if needed
    const finalData = cumulative
      ? calculateCumulativeData(data, Array.from(subcategories))
      : data

    return {
      chartData: finalData,
      totalTransactions: categoryTransactions.length,
    }
  }, [transactions, selectedCategory, viewMode, currentYear, currentMonth, cumulative])

  const subcategories = useMemo(() => {
    if (chartData.length === 0) return []
    const firstEntry = chartData[0]
    return Object.keys(firstEntry).filter((key) => key !== 'period' && key !== 'displayPeriod')
  }, [chartData])

  const handleExport = () => {
    const csvRows = ['Period,' + subcategories.join(',')]
    chartData.forEach((entry) => {
      const values = subcategories.map((s) => entry[s] ?? 0)
      csvRows.push(entry.displayPeriod + ',' + values.join(','))
    })
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `subcategory-analysis-${selectedCategory}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <motion.div
      className="glass p-6 rounded-xl border border-white/10"
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
            className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-300 transition-colors"
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
              className="px-4 py-2 bg-gray-800/80 border border-white/10 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-purple-500/50 min-w-50"
            >
              {categories.map((category) => (
                <option key={category} value={category} className="bg-gray-800 text-gray-200">
                  {category}
                </option>
              ))}
            </select>

            {/* View Mode Toggle */}
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as 'monthly' | 'yearly' | 'all_time')}
              className="px-3 py-1.5 bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-300 text-sm focus:outline-none"
            >
              <option value="monthly" className="bg-gray-800 text-gray-200">Monthly View</option>
              <option value="yearly" className="bg-gray-800 text-gray-200">Yearly View</option>
              <option value="all_time" className="bg-gray-800 text-gray-200">All Time</option>
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
            transactionLabel="transactions"
            handlePrevYear={handlePrevYear}
            handleNextYear={handleNextYear}
            handlePrevMonth={handlePrevMonth}
            handleNextMonth={handleNextMonth}
          />
        </div>

        {/* Chart */}
        {chartData.length > 0 && subcategories.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
              <XAxis
                dataKey="displayPeriod"
                stroke={CHART_AXIS_COLOR}
                tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
              />
              <YAxis
                stroke={CHART_AXIS_COLOR}
                tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
                tickFormatter={(value) => formatCurrencyShort(value)}
              />
              <Tooltip
                {...chartTooltipProps}
                formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
              />
              <Legend
                wrapperStyle={{ paddingTop: '20px' }}
                formatter={(value) => value.length > 20 ? `${value.substring(0, 17)}...` : value}
              />
              {subcategories.map((subcat, index) => (
                <Line
                  key={subcat}
                  type="monotone"
                  dataKey={subcat}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: cumulative ? 4 : 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-100 flex items-center justify-center text-muted-foreground">
            No data available for {selectedCategory}
          </div>
        )}
      </div>
    </motion.div>
  )
}
