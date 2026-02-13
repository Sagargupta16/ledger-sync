import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, Wallet, PiggyBank, CreditCard, LineChart, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { useTrends } from '@/hooks/useAnalytics'
import { ResponsiveContainer, Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { getCurrentYear, getCurrentMonth, getCurrentFY, getAnalyticsDateRange, getDateKey, type AnalyticsViewMode } from '@/lib/dateUtils'
import { useState, useMemo } from 'react'
import { formatCurrency, formatCurrencyShort, formatPercent, formatDateTick } from '@/lib/formatters'
import { chartTooltipProps, PageHeader } from '@/components/ui'
import { CashFlowForecast } from '@/components/analytics'
import EmptyState from '@/components/shared/EmptyState'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { usePreferencesStore } from '@/store/preferencesStore'

type TrendDirection = 'up' | 'down' | 'stable'

interface TrendMetrics {
  current: number
  previous: number
  change: number
  changePercent: number
  direction: TrendDirection
  average: number
  highest: number
  lowest: number
}

function getDirectionIcon(direction: TrendDirection): React.ReactElement {
  if (direction === 'up') {
    return <ArrowUpRight className="w-4 h-4" />
  } else if (direction === 'down') {
    return <ArrowDownRight className="w-4 h-4" />
  } else {
    return <Minus className="w-4 h-4" />
  }
}

function formatTooltipName(name: string | undefined): string {
  if (name === 'income') return 'Income'
  if (name === 'expenses') return 'Spending'
  return 'Savings'
}

export default function TrendsForecastsPage() {
  const { data: preferences } = usePreferences()
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4
  const { displayPreferences } = usePreferencesStore()

  // Time filter state — same as all other analytics pages
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>(
    (displayPreferences.defaultTimeRange as AnalyticsViewMode) || 'fy'
  )
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [currentFY, setCurrentFY] = useState(getCurrentFY(fiscalYearStartMonth))

  // Fetch all trends data; filter client-side by date range
  const { data: trendsData, isLoading } = useTrends('all_time')
  const { data: allTransactions = [] } = useTransactions()

  // Get date range based on current filter
  const dateRange = useMemo(() => {
    return getAnalyticsDateRange(viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth)
  }, [viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth])

  const dataDateRange = useMemo(() => {
    if (!allTransactions || allTransactions.length === 0) return { minDate: undefined, maxDate: undefined }
    const dates = allTransactions.map(t => t.date.substring(0, 10)).sort()
    return { minDate: dates[0], maxDate: dates[dates.length - 1] }
  }, [allTransactions])

  // Filter monthly trends by the selected date range
  const filteredMonthlyTrends = useMemo(() => {
    if (!trendsData?.monthly_trends) return []
    if (!dateRange.start_date) return trendsData.monthly_trends

    return trendsData.monthly_trends.filter((t) => {
      // monthly_trends have a 'month' field like "2024-01" — compare as YYYY-MM
      const monthStart = `${t.month}-01`
      if (dateRange.start_date && monthStart < dateRange.start_date.substring(0, 10)) return false
      if (dateRange.end_date && monthStart > dateRange.end_date.substring(0, 10)) return false
      return true
    })
  }, [trendsData, dateRange])

  // Calculate comprehensive trend metrics
  const metrics = useMemo(() => {
    const defaultMetrics: TrendMetrics = {
      current: 0,
      previous: 0,
      change: 0,
      changePercent: 0,
      direction: 'stable',
      average: 0,
      highest: 0,
      lowest: 0,
    }

    if (!filteredMonthlyTrends || filteredMonthlyTrends.length < 1) {
      return {
        spending: defaultMetrics,
        income: defaultMetrics,
        savings: defaultMetrics,
      }
    }

    const trends = filteredMonthlyTrends
    const latest = trends.at(-1)!
    const previous = trends.length > 1 ? trends.at(-2)! : latest

    // Calculate spending metrics
    const expenses = trends.map(t => t.expenses)
    const spendingChange = latest.expenses - previous.expenses
    const spendingChangePercent = previous.expenses > 0 ? (spendingChange / previous.expenses) * 100 : 0

    // Calculate income metrics
    const incomes = trends.map(t => t.income)
    const incomeChange = latest.income - previous.income
    const incomeChangePercent = previous.income > 0 ? (incomeChange / previous.income) * 100 : 0

    // Calculate savings metrics
    const surpluses = trends.map(t => t.surplus)
    const savingsChange = latest.surplus - previous.surplus
    const savingsChangePercent = previous.surplus === 0 ? 0 : (savingsChange / Math.abs(previous.surplus)) * 100

    const getDirection = (change: number): TrendDirection => {
      if (Math.abs(change) < 2) return 'stable'
      return change > 0 ? 'up' : 'down'
    }

    return {
      spending: {
        current: latest.expenses,
        previous: previous.expenses,
        change: spendingChange,
        changePercent: spendingChangePercent,
        direction: getDirection(spendingChangePercent),
        average: expenses.reduce((a, b) => a + b, 0) / expenses.length,
        highest: Math.max(...expenses),
        lowest: Math.min(...expenses),
      },
      income: {
        current: latest.income,
        previous: previous.income,
        change: incomeChange,
        changePercent: incomeChangePercent,
        direction: getDirection(incomeChangePercent),
        average: incomes.reduce((a, b) => a + b, 0) / incomes.length,
        highest: Math.max(...incomes),
        lowest: Math.min(...incomes),
      },
      savings: {
        current: latest.surplus,
        previous: previous.surplus,
        change: savingsChange,
        changePercent: savingsChangePercent,
        direction: getDirection(savingsChangePercent),
        average: surpluses.reduce((a, b) => a + b, 0) / surpluses.length,
        highest: Math.max(...surpluses),
        lowest: Math.min(...surpluses),
      },
    }
  }, [filteredMonthlyTrends])

  // Prepare chart data for individual trend lines
  const chartData = useMemo(() => {
    if (!filteredMonthlyTrends.length) return []

    const rawData = filteredMonthlyTrends.map((t, index, arr) => {
      const prev = index > 0 ? arr[index - 1] : t
      const rawSavingsRate = t.income > 0 ? (t.surplus / t.income) * 100 : 0
      return {
        ...t,
        spendingChange: index > 0 ? ((t.expenses - prev.expenses) / prev.expenses) * 100 : 0,
        incomeChange: index > 0 ? ((t.income - prev.income) / prev.income) * 100 : 0,
        rawSavingsRate,
        // Clamp negative savings rate to 0 for cleaner visualization
        savingsRate: Math.max(0, rawSavingsRate),
      }
    })

    return rawData
  }, [filteredMonthlyTrends])

  // Filter transactions by the selected date range
  const filteredTransactions = useMemo(() => {
    if (!allTransactions.length) return []
    if (!dateRange.start_date) return allTransactions

    return allTransactions.filter((t) => {
      const txDate = getDateKey(t.date)
      return txDate >= dateRange.start_date! && (!dateRange.end_date || txDate <= dateRange.end_date)
    })
  }, [allTransactions, dateRange])

  // Daily cumulative savings rate data
  const dailySavingsData = useMemo(() => {
    if (!filteredTransactions.length) return []

    const dailyMap: Record<string, { income: number; expense: number }> = {}
    for (const tx of filteredTransactions) {
      const day = tx.date.substring(0, 10)
      if (!dailyMap[day]) dailyMap[day] = { income: 0, expense: 0 }
      if (tx.type === 'Income') dailyMap[day].income += tx.amount
      else if (tx.type === 'Expense') dailyMap[day].expense += tx.amount
    }

    const sortedDays = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b))
    let cumIncome = 0
    let cumExpense = 0

    return sortedDays.map(([date, { income, expense }]) => {
      cumIncome += income
      cumExpense += expense
      const savingsRate = cumIncome > 0 ? ((cumIncome - cumExpense) / cumIncome) * 100 : 0
      return {
        date,
        savingsRate: Math.max(0, savingsRate),
        rawSavingsRate: savingsRate,
      }
    })
  }, [filteredTransactions])

  // Daily income/expense/savings data for the overview chart
  const dailyTrendData = useMemo(() => {
    if (!filteredTransactions.length) return []

    const dailyMap: Record<string, { income: number; expense: number }> = {}
    for (const tx of filteredTransactions) {
      const day = tx.date.substring(0, 10)
      if (!dailyMap[day]) dailyMap[day] = { income: 0, expense: 0 }
      if (tx.type === 'Income') dailyMap[day].income += tx.amount
      else if (tx.type === 'Expense') dailyMap[day].expense += tx.amount
    }

    return Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { income, expense }]) => ({
        date,
        income,
        expenses: expense,
        savings: income - expense,
      }))
  }, [filteredTransactions])

  const getTrendIcon = (direction: TrendDirection, isPositiveGood: boolean) => {
    if (direction === 'stable') return <Minus className="w-5 h-5 text-gray-400" />
    if (direction === 'up') {
      return isPositiveGood 
        ? <TrendingUp className="w-5 h-5 text-green-500" />
        : <TrendingUp className="w-5 h-5 text-red-500" />
    }
    return isPositiveGood
      ? <TrendingDown className="w-5 h-5 text-red-500" />
      : <TrendingDown className="w-5 h-5 text-green-500" />
  }

  const getTrendColor = (direction: TrendDirection, isPositiveGood: boolean) => {
    if (direction === 'stable') return 'text-gray-400'
    if (direction === 'up') return isPositiveGood ? 'text-green-500' : 'text-red-500'
    return isPositiveGood ? 'text-red-500' : 'text-green-500'
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Trends & Forecasts"
          subtitle="Analyze patterns and predict future trends"
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
              minDate={dataDateRange.minDate}
              maxDate={dataDateRange.maxDate}
              fiscalYearStartMonth={fiscalYearStartMonth}
            />
          }
        />

        {/* Trend Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Spending Trend Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-500/20 rounded-xl">
                  <CreditCard className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Spending Trend</p>
                  <p className="text-2xl font-bold text-white">
                    {isLoading ? '...' : formatCurrency(metrics.spending.current)}
                  </p>
                </div>
              </div>
              {!isLoading && getTrendIcon(metrics.spending.direction, false)}
            </div>
            
            {!isLoading && (
              <div className="space-y-3">
                <div className={`flex items-center gap-2 ${getTrendColor(metrics.spending.direction, false)}`}>
                  {getDirectionIcon(metrics.spending.direction)}
                  <span className="font-semibold">{formatPercent(metrics.spending.changePercent)}</span>
                  <span className="text-gray-500 text-sm">vs previous month</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
                  <div>
                    <p className="text-xs text-gray-500">Average</p>
                    <p className="text-sm font-medium text-gray-300">{formatCurrency(metrics.spending.average)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Peak</p>
                    <p className="text-sm font-medium text-gray-300">{formatCurrency(metrics.spending.highest)}</p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>

          {/* Income Trend Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-500/20 rounded-xl">
                  <Wallet className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Income Trend</p>
                  <p className="text-2xl font-bold text-white">
                    {isLoading ? '...' : formatCurrency(metrics.income.current)}
                  </p>
                </div>
              </div>
              {!isLoading && getTrendIcon(metrics.income.direction, true)}
            </div>
            
            {!isLoading && (
              <div className="space-y-3">
                <div className={`flex items-center gap-2 ${getTrendColor(metrics.income.direction, true)}`}>
                  {getDirectionIcon(metrics.income.direction)}
                  <span className="font-semibold">{formatPercent(metrics.income.changePercent)}</span>
                  <span className="text-gray-500 text-sm">vs previous month</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
                  <div>
                    <p className="text-xs text-gray-500">Average</p>
                    <p className="text-sm font-medium text-gray-300">{formatCurrency(metrics.income.average)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Peak</p>
                    <p className="text-sm font-medium text-gray-300">{formatCurrency(metrics.income.highest)}</p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>

          {/* Savings Trend Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-500/20 rounded-xl">
                  <PiggyBank className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Savings Trend</p>
                  <p className={`text-2xl font-bold ${metrics.savings.current >= 0 ? 'text-white' : 'text-red-400'}`}>
                    {isLoading ? '...' : formatCurrency(metrics.savings.current)}
                  </p>
                </div>
              </div>
              {!isLoading && getTrendIcon(metrics.savings.direction, true)}
            </div>
            
            {!isLoading && (
              <div className="space-y-3">
                <div className={`flex items-center gap-2 ${getTrendColor(metrics.savings.direction, true)}`}>
                  {getDirectionIcon(metrics.savings.direction)}
                  <span className="font-semibold">{formatPercent(metrics.savings.changePercent)}</span>
                  <span className="text-gray-500 text-sm">vs previous month</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
                  <div>
                    <p className="text-xs text-gray-500">Average</p>
                    <p className={`text-sm font-medium ${metrics.savings.average >= 0 ? 'text-gray-300' : 'text-red-400'}`}>
                      {formatCurrency(metrics.savings.average)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Best Month</p>
                    <p className="text-sm font-medium text-green-400">{formatCurrency(metrics.savings.highest)}</p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </div>

        {/* Main Trend Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <div className="flex items-center gap-3 mb-6">
            <LineChart className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Income & Expense Trends</h3>
          </div>
          {isLoading && (
            <div className="h-80 flex items-center justify-center">
              <div className="animate-pulse text-gray-400">Loading chart...</div>
            </div>
          )}
          {!isLoading && dailyTrendData.length > 0 && (
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={dailyTrendData}>
                <defs>
                  <linearGradient id="trendIncomeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="trendExpenseGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="trendSavingsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickFormatter={(v) => formatDateTick(v, dailyTrendData.length)} angle={-45} textAnchor="end" height={80} interval={Math.max(1, Math.floor(dailyTrendData.length / 20))} />
                <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={(v) => formatCurrencyShort(v)} />
                <Tooltip
                  {...chartTooltipProps}
                  labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  formatter={(value: number | undefined, name: string | undefined) => [
                    value === undefined ? '' : formatCurrency(value),
                    formatTooltipName(name)
                  ]}
                />
                <Legend />
                <Area type="natural" dataKey="income" name="Income" stroke="#10b981" fill="url(#trendIncomeGradient)" strokeWidth={2} isAnimationActive={dailyTrendData.length < 500} />
                <Area type="natural" dataKey="expenses" name="Spending" stroke="#ef4444" fill="url(#trendExpenseGradient)" strokeWidth={2} isAnimationActive={dailyTrendData.length < 500} />
                <Area type="natural" dataKey="savings" name="Savings" stroke="#a855f7" fill="url(#trendSavingsGradient)" strokeWidth={2} isAnimationActive={dailyTrendData.length < 500} />
              </AreaChart>
            </ResponsiveContainer>
          )}
          {!isLoading && dailyTrendData.length === 0 && (
            <EmptyState
              icon={LineChart}
              title="No data available"
              description="Upload your transaction data to see spending trends and forecasts."
              actionLabel="Upload Data"
              actionHref="/upload"
            />
          )}
        </motion.div>

        {/* Savings Rate Trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <div className="flex items-center gap-3 mb-6">
            <PiggyBank className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-white">Savings Rate Trend</h3>
            <span className="text-sm text-gray-500">(% of income saved each month)</span>
          </div>
          {isLoading && (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-pulse text-gray-400">Loading chart...</div>
            </div>
          )}
          {!isLoading && dailySavingsData.length > 0 && (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={dailySavingsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickFormatter={(v) => formatDateTick(v, dailySavingsData.length)} angle={-45} textAnchor="end" height={70} interval={Math.max(1, Math.floor(dailySavingsData.length / 15))} />
                <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={(v) => `${Math.round(v)}%`} domain={[0, 'auto']} />
                <Tooltip
                  {...chartTooltipProps}
                  labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  formatter={(_value: number | undefined, _name: string | undefined, props: { payload?: { rawSavingsRate?: number } }) => {
                    const actual = props.payload?.rawSavingsRate ?? 0
                    const label = actual < 0 ? `${actual.toFixed(1)}% (deficit)` : `${actual.toFixed(1)}%`
                    return [label, 'Cumulative Savings Rate']
                  }}
                />
                <defs>
                  <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area
                  type="natural"
                  dataKey="savingsRate"
                  stroke="#a855f7"
                  fill="url(#savingsGradient)"
                  strokeWidth={2}
                  isAnimationActive={dailySavingsData.length < 500}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
          {!isLoading && dailySavingsData.length === 0 && (
            <EmptyState
              icon={PiggyBank}
              title="No data available"
              description="Add transactions to track your savings rate over time."
              variant="compact"
            />
          )}
        </motion.div>

        {/* Monthly Breakdown Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <h3 className="text-lg font-semibold text-white mb-6">Month-on-Month Breakdown</h3>
          {isLoading && (
            <div className="text-center py-8 text-gray-400">Loading data...</div>
          )}
          {!isLoading && chartData.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Month</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Income</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Spending</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Savings</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Savings Rate</th>
                  </tr>
                </thead>
                <motion.tbody
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {chartData.slice(-8).map((trend) => (
                    <tr
                      key={trend.month}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="py-3 px-4 text-white font-medium">{trend.month}</td>
                      <td className="py-3 px-4 text-right text-green-400">{formatCurrency(trend.income)}</td>
                      <td className="py-3 px-4 text-right text-red-400">{formatCurrency(trend.expenses)}</td>
                      <td className={`py-3 px-4 text-right font-bold ${trend.surplus >= 0 ? 'text-purple-400' : 'text-red-400'}`}>
                        {formatCurrency(trend.surplus)}
                      </td>
                      <td className={`py-3 px-4 text-right ${trend.rawSavingsRate >= 0 ? 'text-gray-300' : 'text-red-400'}`}>
                        {trend.rawSavingsRate.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </motion.tbody>
              </table>
            </div>
          )}
          {!isLoading && chartData.length === 0 && (
            <EmptyState
              icon={TrendingUp}
              title="No data available"
              description="Monthly breakdown will appear here once you have transactions."
              variant="compact"
            />
          )}
        </motion.div>

        {/* Cash Flow Forecast */}
        <CashFlowForecast />
      </div>
    </div>
  )
}
