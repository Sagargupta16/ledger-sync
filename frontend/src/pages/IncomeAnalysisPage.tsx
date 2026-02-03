import { motion } from 'framer-motion'
import { TrendingUp, DollarSign, Activity, BarChart3, Calendar, Wallet, Briefcase, Gift, PiggyBank } from 'lucide-react'
import { useCategoryBreakdown } from '@/hooks/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts'
import { useState, useMemo } from 'react'
import { formatCurrency, formatCurrencyShort, formatPercent } from '@/lib/formatters'
import { INCOME_COLORS } from '@/constants/chartColors'
import { getCurrentYear, getCurrentMonth } from '@/lib/dateUtils'
import EmptyState from '@/components/shared/EmptyState'
import { 
  calculateIncomeBreakdown, 
  INCOME_TYPE_LABELS, 
  INCOME_TYPE_COLORS,
  type IncomeType 
} from '@/lib/preferencesUtils'

const COLORS = INCOME_COLORS

// Icons for income types
const INCOME_TYPE_ICONS: Record<IncomeType, React.ComponentType<{ className?: string }>> = {
  salary: Briefcase,
  bonus: Gift,
  investmentIncome: TrendingUp,
  cashback: Wallet,
  other: PiggyBank,
}

export default function IncomeAnalysisPage() {
  const [viewMode, setViewMode] = useState<'monthly' | 'yearly' | 'all_time'>('yearly')
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  
  const { data: incomeData, isLoading: incomeLoading } = useCategoryBreakdown({ transaction_type: 'income' })
  const { data: transactions } = useTransactions()
  const { data: preferences } = usePreferences()

  const totalIncome = incomeData?.total || 0
  const topSource = Object.entries(incomeData?.categories || {}).sort((a, b) => b[1].total - a[1].total)[0]?.[0] || 'N/A'

  // Calculate income breakdown by type (salary, bonus, investment, cashback)
  const incomeBreakdown = useMemo(() => {
    if (!transactions || !preferences) return null
    
    return calculateIncomeBreakdown(transactions, {
      salary: preferences.salary_categories || {},
      bonus: preferences.bonus_categories || {},
      investmentIncome: preferences.investment_income_categories || {},
      cashback: preferences.cashback_categories || {},
    })
  }, [transactions, preferences])

  // Prepare income type chart data
  const incomeTypeChartData = useMemo(() => {
    if (!incomeBreakdown) return []
    return (Object.entries(incomeBreakdown) as [IncomeType, number][])
      .filter(([, value]) => value > 0)
      .map(([type, value]) => ({
        name: INCOME_TYPE_LABELS[type],
        type,
        value,
        color: INCOME_TYPE_COLORS[type],
      }))
      .sort((a, b) => b.value - a.value)
  }, [incomeBreakdown])

  // Get primary income type
  const primaryIncomeType = incomeTypeChartData[0]?.name || 'N/A'

  // Process income trend data
  const trendData = useMemo(() => {
    if (!transactions) return []
    
    const incomeTransactions = transactions.filter((t) => {
      if (t.type !== 'Income') return false
      if (viewMode === 'yearly') {
        const txYear = Number.parseInt(t.date.substring(0, 4))
        return txYear === currentYear
      }
      if (viewMode === 'monthly') {
        return t.date.substring(0, 7) === currentMonth
      }
      return true // all_time
    })
    
    const periodGroups: Record<string, number> = {}
    
    incomeTransactions.forEach((tx) => {
      let period: string
      if (viewMode === 'monthly') {
        period = tx.date.substring(8, 10) // DD
      } else if (viewMode === 'yearly') {
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
    } else if (viewMode === 'yearly') {
      allPeriods = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
    } else {
      allPeriods = Object.keys(periodGroups).sort()
    }
    
    return allPeriods.map((period) => ({
      period,
      displayPeriod: viewMode === 'monthly'
        ? period
        : viewMode === 'yearly'
        ? new Date(currentYear, Number.parseInt(period) - 1).toLocaleDateString('en-US', { month: 'short' })
        : period,
      income: periodGroups[period] || 0
    }))
  }, [transactions, viewMode, currentYear, currentMonth])

  // Calculate metrics
  const avgIncome = useMemo(() => {
    if (trendData.length === 0) return 0
    const total = trendData.reduce((sum, d) => sum + d.income, 0)
    return total / trendData.length
  }, [trendData])

  const growthRate = useMemo(() => {
    if (trendData.length < 2) return 0
    const nonZeroData = trendData.filter(d => d.income > 0)
    if (nonZeroData.length < 2) return 0
    return ((nonZeroData[nonZeroData.length - 1].income - nonZeroData[0].income) / nonZeroData[0].income * 100)
  }, [trendData])

  const isLoading = incomeLoading

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent drop-shadow-lg">
            Income Analysis
          </h1>
          <p className="text-muted-foreground mt-2">Track income sources and trends</p>
        </motion.div>

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
                <Calendar className="w-6 h-6 text-cyan-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg per Period</p>
                <p className="text-2xl font-bold">{isLoading ? '...' : formatCurrency(avgIncome)}</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Income Type Breakdown */}
        <motion.div 
          className="glass p-6 rounded-xl border border-white/10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
        >
          <h3 className="text-lg font-semibold text-white mb-4">Income by Type</h3>
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
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{
                        background: 'rgba(0,0,0,0.9)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        color: '#fff',
                      }}
                      labelStyle={{ color: '#9ca3af' }}
                      itemStyle={{ color: '#fff' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {incomeTypeChartData.map((item) => {
                  const Icon = INCOME_TYPE_ICONS[item.type as IncomeType]
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
                          <Icon className="w-5 h-5" style={{ color: item.color }} />
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <BarChart3 className="w-5 h-5 text-green-400" />
                <h3 className="text-lg font-semibold text-white">Income Trend</h3>
              </div>
            </div>

            {/* View Controls */}
            <div className="flex items-center justify-between flex-wrap gap-4">
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as 'monthly' | 'yearly' | 'all_time')}
                className="px-3 py-1.5 bg-green-500/20 border border-green-500/30 rounded-lg text-green-300 text-sm focus:outline-none"
              >
                <option value="monthly" className="bg-gray-800 text-gray-200">Monthly View</option>
                <option value="yearly" className="bg-gray-800 text-gray-200">Yearly View</option>
                <option value="all_time" className="bg-gray-800 text-gray-200">All Time</option>
              </select>

              {/* Navigation */}
              {viewMode === 'monthly' && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      const date = new Date(currentMonth + '-01')
                      date.setMonth(date.getMonth() - 1)
                      setCurrentMonth(date.toISOString().substring(0, 7))
                    }}
                    className="p-1.5 hover:bg-gray-700/50 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
                    type="button"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <span className="text-white font-medium min-w-[120px] text-center">
                    {new Date(currentMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </span>
                  <button
                    onClick={() => {
                      const date = new Date(currentMonth + '-01')
                      date.setMonth(date.getMonth() + 1)
                      setCurrentMonth(date.toISOString().substring(0, 7))
                    }}
                    className="p-1.5 hover:bg-gray-700/50 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
                    type="button"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              )}
              {viewMode === 'yearly' && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCurrentYear((prev) => prev - 1)}
                    className="p-1.5 hover:bg-gray-700/50 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
                    type="button"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <span className="text-white font-medium min-w-[100px] text-center">Year {currentYear}</span>
                  <button
                    onClick={() => setCurrentYear((prev) => prev + 1)}
                    className="p-1.5 hover:bg-gray-700/50 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
                    type="button"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              )}
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
                    contentStyle={{
                      backgroundColor: 'rgba(17, 24, 39, 0.95)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                    labelStyle={{ color: '#9ca3af' }}
                    itemStyle={{ color: '#fff' }}
                    formatter={(value: number) => [formatCurrency(value), 'Income']}
                  />
                  <Line
                    type="monotone"
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
            {Object.entries(incomeData?.categories || {})
              .sort((a, b) => b[1].total - a[1].total)
              .map(([source, data], index) => (
                <div
                  key={source}
                  className="flex items-center justify-between p-4 rounded-lg bg-gray-800/30 hover:bg-gray-800/50 transition-all"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="font-medium text-white">{source}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-white">
                      {formatCurrency(data.total)}
                    </div>
                    <div className="text-sm text-gray-400">{formatPercent(data.percentage)}</div>
                  </div>
                </div>
              ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
