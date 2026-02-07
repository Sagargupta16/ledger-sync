import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { CHART_COLORS_WARM } from '@/constants/chartColors'
import { getCurrentYear, getCurrentMonth } from '@/lib/dateUtils'
import { chartTooltipProps } from '@/components/ui'

const COLORS = CHART_COLORS_WARM.slice(0, 8) // Use first 8 colors

export default function MultiCategoryTimeAnalysis() {
  const [viewMode, setViewMode] = useState<'monthly' | 'yearly' | 'all_time'>('yearly')
  const [cumulative, setCumulative] = useState(true)
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())

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
    
    // Convert to array format with all periods
    let allPeriods: string[] = []
    if (viewMode === 'monthly') {
      // Show all days in the current month
      const year = Number.parseInt(currentMonth.substring(0, 4))
      const month = Number.parseInt(currentMonth.substring(5, 7))
      const daysInMonth = new Date(year, month, 0).getDate()
      allPeriods = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'))
    } else if (viewMode === 'yearly') {
      // Show all 12 months for yearly view
      allPeriods = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
    } else {
      // Get all quarters from data for all_time view
      allPeriods = Object.keys(groupedData).sort()
    }
    
    const data = allPeriods.map((period) => {
      const entry: Record<string, number | string> = { 
        period,
        displayPeriod: viewMode === 'monthly'
          ? period // Day number
          : viewMode === 'yearly'
          ? new Date(currentYear, Number.parseInt(period) - 1).toLocaleDateString('en-US', { month: 'short' })
          : period // Quarter format (YYYY-Q1)
      }
      topCategories.forEach((category) => {
        entry[category] = groupedData[period]?.[category] || 0
      })
      return entry
    })
    
    // Calculate cumulative if needed
    let finalData = data
    if (cumulative) {
      const cumulativeData: Record<string, number> = {}
      topCategories.forEach((category) => {
        cumulativeData[category] = 0
      })
      
      finalData = data.map((entry) => {
        const newEntry: Record<string, number | string> = { 
          period: entry.period,
          displayPeriod: entry.displayPeriod
        }
        topCategories.forEach((category) => {
          cumulativeData[category] += (entry[category] as number) || 0
          newEntry[category] = cumulativeData[category]
        })
        return newEntry
      })
    }
    
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
    // TODO: Implement export functionality
  }

  const handlePrevYear = () => setCurrentYear((prev) => prev - 1)
  const handleNextYear = () => setCurrentYear((prev) => prev + 1)

  const handlePrevMonth = () => {
    const date = new Date(currentMonth + '-01')
    date.setMonth(date.getMonth() - 1)
    setCurrentMonth(date.toISOString().substring(0, 7))
  }
  
  const handleNextMonth = () => {
    const date = new Date(currentMonth + '-01')
    date.setMonth(date.getMonth() + 1)
    setCurrentMonth(date.toISOString().substring(0, 7))
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
            className="p-2 bg-gray-800/50 hover:bg-gray-700/50 border border-white/10 rounded-lg text-gray-300 transition-colors"
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
          {viewMode === 'monthly' && (
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrevMonth}
                className="p-1.5 hover:bg-gray-700/50 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
                type="button"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-white font-medium min-w-[120px] text-center">
                {new Date(currentMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button
                onClick={handleNextMonth}
                className="p-1.5 hover:bg-gray-700/50 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
                type="button"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <span className="text-gray-400 text-sm ml-2">{totalTransactions} expense transactions</span>
            </div>
          )}
          {viewMode === 'yearly' && (
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrevYear}
                className="p-1.5 hover:bg-gray-700/50 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
                type="button"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-white font-medium min-w-[100px] text-center">Year {currentYear}</span>
              <button
                onClick={handleNextYear}
                className="p-1.5 hover:bg-gray-700/50 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
                type="button"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <span className="text-gray-400 text-sm ml-2">{totalTransactions} expense transactions</span>
            </div>
          )}
          {viewMode === 'all_time' && (
            <div className="flex items-center gap-3">
              <span className="text-gray-400 text-sm">{totalTransactions} expense transactions</span>
            </div>
          )}
        </div>

        {/* Chart */}
        {chartData.length > 0 && topCategories.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            {cumulative ? (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="displayPeriod"
                  stroke="#9ca3af"
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                />
                <YAxis
                  stroke="#9ca3af"
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  tickFormatter={(value) => formatCurrencyShort(value)}
                />
                <Tooltip
                  {...chartTooltipProps}
                  formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                {topCategories.map((category, index) => (
                  <Line
                    key={category}
                    type="monotone"
                    dataKey={category}
                    stroke={COLORS[index % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            ) : (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="displayPeriod"
                  stroke="#9ca3af"
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                />
                <YAxis
                  stroke="#9ca3af"
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  tickFormatter={(value) => formatCurrencyShort(value)}
                />
                <Tooltip
                  {...chartTooltipProps}
                  formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                {topCategories.map((category, index) => (
                  <Line
                    key={category}
                    type="monotone"
                    dataKey={category}
                    stroke={COLORS[index % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        ) : (
          <div className="h-[400px] flex items-center justify-center text-gray-400">No data available</div>
        )}
      </div>
    </motion.div>
  )
}
