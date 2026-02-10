import { motion } from 'framer-motion'
import { TrendingUp, DollarSign, Activity, Wallet, Briefcase, PiggyBank } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts'
import { chartTooltipProps, PageHeader } from '@/components/ui'
import { useState, useMemo } from 'react'
import { formatCurrency, formatCurrencyShort, formatPercent } from '@/lib/formatters'
import { getCurrentYear, getCurrentMonth, getCurrentFY, getAnalyticsDateRange, getDateKey, type AnalyticsViewMode } from '@/lib/dateUtils'
import EmptyState from '@/components/shared/EmptyState'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { 
  calculateIncomeByCategoryBreakdown,
  calculateCashbacksTotal,
  INCOME_CATEGORY_COLORS,
} from '@/lib/preferencesUtils'

// Icons for income categories (based on actual data categories)
const INCOME_CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'Employment Income': Briefcase,
  'Investment Income': TrendingUp,
  'Refund & Cashbacks': Wallet,
  'One-time Income': PiggyBank,
  'Other Income': DollarSign,
  'Business/Self Employment Income': Activity,
}

export default function IncomeAnalysisPage() {
  const { data: preferences } = usePreferences()
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4

  // Time filter state
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>('fy')
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [currentFY, setCurrentFY] = useState(getCurrentFY(fiscalYearStartMonth))
  
  const { data: transactions } = useTransactions()

  // Get date range based on current filter
  const dateRange = useMemo(() => {
    return getAnalyticsDateRange(viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth)
  }, [viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth])

  // Filter transactions by date range
  const filteredTransactions = useMemo(() => {
    if (!transactions) return []
    if (!dateRange.start_date) return transactions
    
    return transactions.filter((t) => {
      // Compare only the date part (YYYY-MM-DD) to handle datetime strings correctly
      const txDate = getDateKey(t.date)
      return txDate >= dateRange.start_date! && (!dateRange.end_date || txDate <= dateRange.end_date)
    })
  }, [transactions, dateRange])

  // Calculate totals for filtered period
  const totalIncome = useMemo(() => {
    return filteredTransactions
      .filter((t) => t.type === 'Income')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
  }, [filteredTransactions])

  // Calculate income breakdown by actual data category (for display)
  const incomeBreakdown = useMemo(() => {
    return calculateIncomeByCategoryBreakdown(filteredTransactions)
  }, [filteredTransactions])

  // Calculate total cashbacks using preferences classification
  const cashbacksTotal = useMemo(() => {
    if (!preferences) return 0
    
    const incomeClassification = {
      taxable: preferences.taxable_income_categories || [],
      investmentReturns: preferences.investment_returns_categories || [],
      nonTaxable: preferences.non_taxable_income_categories || [],
      other: preferences.other_income_categories || [],
    }
    
    return calculateCashbacksTotal(filteredTransactions, incomeClassification)
  }, [filteredTransactions, preferences])

  // Prepare income category chart data (using actual data categories)
  const incomeTypeChartData = useMemo(() => {
    if (!incomeBreakdown) return []
    const defaultColor = '#6b7280'
    return Object.entries(incomeBreakdown)
      .filter(([, value]) => value > 0)
      .map(([category, value]) => ({
        name: category,
        category,
        value,
        color: INCOME_CATEGORY_COLORS[category] || defaultColor,
      }))
      .sort((a, b) => b.value - a.value)
  }, [incomeBreakdown])

  // Get primary income type
  const primaryIncomeType = incomeTypeChartData[0]?.name || 'N/A'

  // Process income trend data
  const trendData = useMemo(() => {
    const incomeTransactions = filteredTransactions.filter((t) => t.type === 'Income')
    
    const periodGroups: Record<string, number> = {}
    
    incomeTransactions.forEach((tx) => {
      let period: string
      if (viewMode === 'monthly') {
        period = tx.date.substring(8, 10) // DD
      } else if (viewMode === 'yearly' || viewMode === 'fy') {
        period = tx.date.substring(5, 7) // MM
      } else {
        // all_time: quarterly
        const year = tx.date.substring(0, 4)
        const month = Number.parseInt(tx.date.substring(5, 7))
        const quarter = Math.ceil(month / 3)
        period = `${year}-Q${quarter}`
      }
      
      periodGroups[period] = (periodGroups[period] || 0) + Math.abs(tx.amount)
    })
    
    // Generate all periods
    let allPeriods: string[] = []
    if (viewMode === 'monthly') {
      const year = Number.parseInt(currentMonth.substring(0, 4))
      const month = Number.parseInt(currentMonth.substring(5, 7))
      const daysInMonth = new Date(year, month, 0).getDate()
      allPeriods = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'))
    } else if (viewMode === 'yearly' || viewMode === 'fy') {
      allPeriods = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
    } else {
      allPeriods = Object.keys(periodGroups).sort((a, b) => a.localeCompare(b))
    }
    
    return allPeriods.map((period) => {
      let displayPeriod = period
      if (viewMode === 'yearly' || viewMode === 'fy') {
        displayPeriod = new Date(currentYear, Number.parseInt(period) - 1).toLocaleDateString('en-US', { month: 'short' })
      }
      return {
        period,
        displayPeriod,
        income: periodGroups[period] || 0
      }
    })
  }, [filteredTransactions, viewMode, currentYear, currentMonth])

  const growthRate = useMemo(() => {
    if (trendData.length < 2) return 0
    const nonZeroData = trendData.filter(d => d.income > 0)
    if (nonZeroData.length < 2) return 0
    const lastValue = nonZeroData.at(-1)?.income || 0
    const firstValue = nonZeroData[0]?.income || 1
    return ((lastValue - firstValue) / firstValue * 100)
  }, [trendData])

  const isLoading = !transactions

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Income Analysis"
          subtitle="Track your income sources and trends"
          action={
            <AnalyticsTimeFilter
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              currentYear={currentYear}
              currentMonth={currentMonth}
              currentFY={currentFY}
              onYearChange={setCurrentYear}
              onMonthChange={setCurrentMonth}
              onFYChange={setCurrentFY}
            />
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-xl border border-white/10 p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-500/20 rounded-xl shadow-lg shadow-green-500/30">
                <DollarSign className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Income</p>
                <p className="text-2xl font-bold">{isLoading ? '...' : formatCurrency(totalIncome)}</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass rounded-xl border border-white/10 p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/20 rounded-xl shadow-lg shadow-primary/30">
                <Activity className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Primary Income Type</p>
                <p className="text-2xl font-bold">{isLoading ? '...' : primaryIncomeType}</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass rounded-xl border border-white/10 p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-500/20 rounded-xl shadow-lg shadow-blue-500/30">
                <TrendingUp className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Growth Rate</p>
                <p className="text-2xl font-bold">{isLoading ? '...' : formatPercent(growthRate, true)}</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass rounded-xl border border-white/10 p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-cyan-500/20 rounded-xl shadow-lg shadow-cyan-500/30">
                <Wallet className="w-6 h-6 text-cyan-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">💳 Cashbacks Earned</p>
                <p className="text-2xl font-bold text-cyan-400">{isLoading ? '...' : formatCurrency(cashbacksTotal)}</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Income Category Breakdown */}
        <motion.div 
          className="glass p-6 rounded-xl border border-white/10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
        >
          <h3 className="text-lg font-semibold text-white mb-4">Income by Category</h3>
          {incomeTypeChartData.length > 0 ? (
            <div className="flex flex-col lg:flex-row items-center gap-8">
              <div className="w-64 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={incomeTypeChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      dataKey="value"
                      stroke="none"
                    >
                      {incomeTypeChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      {...chartTooltipProps}
                      formatter={(value: number | undefined) => value !== undefined ? formatCurrency(value) : ''}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {incomeTypeChartData.map((item) => {
                  const Icon = INCOME_CATEGORY_ICONS[item.category] || DollarSign
                  const percentage = incomeBreakdown
                    ? ((item.value / Object.values(incomeBreakdown).reduce((a, b) => a + b, 0)) * 100).toFixed(1)
                    : '0'
                  return (
                    <div
                      key={item.name}
                      className="p-4 rounded-lg bg-gray-800/30 hover:bg-gray-800/50 transition-all"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div 
                          className="p-2 rounded-lg"
                          style={{ backgroundColor: `${item.color}20` }}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium text-white">{item.name}</p>
                          <p className="text-xs text-gray-400">{percentage}% of income</p>
                        </div>
                      </div>
                      <p className="text-xl font-bold" style={{ color: item.color }}>
                        {formatCurrency(item.value)}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Wallet}
              title="No income type data available"
              description="Configure income categories in Settings to see breakdown."
              actionLabel="Go to Settings"
              actionHref="/settings"
            />
          )}
        </motion.div>

        {/* Income Trend Chart */}
        <motion.div 
          className="glass p-6 rounded-xl border border-white/10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-green-400" />
              <h3 className="text-lg font-semibold text-white">Income Trend</h3>
            </div>

            {/* Chart */}
            {isLoading ? (
              <div className="h-96 flex items-center justify-center">
                <div className="animate-pulse text-gray-400">Loading chart...</div>
              </div>
            ) : trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={trendData}>
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
                    formatter={(value: number | undefined) => value !== undefined ? [formatCurrency(value), 'Income'] : ''}
                  />
                  <Line
                    type="natural"
                    dataKey="income"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#10b981' }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                icon={TrendingUp}
                title="No income data available"
                description="Start by uploading your transaction data to see income trends."
                actionLabel="Upload Data"
                actionHref="/upload"
              />
            )}
          </div>
        </motion.div>

        {/* Income Sources Breakdown */}
        <motion.div 
          className="glass p-6 rounded-xl border border-white/10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <h3 className="text-lg font-semibold text-white mb-4">Income Sources</h3>
          <div className="space-y-3">
            {incomeTypeChartData.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between p-4 rounded-lg bg-gray-800/30 hover:bg-gray-800/50 transition-all"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="font-medium text-white">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-white">
                      {formatCurrency(item.value)}
                    </div>
                    <div className="text-sm text-gray-400">{formatPercent((item.value / totalIncome) * 100)}</div>
                  </div>
                </div>
              ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
