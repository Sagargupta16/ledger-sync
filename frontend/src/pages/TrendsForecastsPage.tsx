import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, Wallet, PiggyBank, CreditCard, LineChart, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { useTrends } from '@/hooks/useAnalytics'
import { ResponsiveContainer, ComposedChart, Line, Bar, Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { useState, useMemo } from 'react'
import { formatCurrency, formatCurrencyShort, formatPercent } from '@/lib/formatters'
import { chartTooltipProps, PageHeader } from '@/components/ui'
import { CashFlowForecast } from '@/components/analytics'
import EmptyState from '@/components/shared/EmptyState'

import type { TimeRange } from '@/types'

interface TrendMetrics {
  current: number
  previous: number
  change: number
  changePercent: number
  direction: 'up' | 'down' | 'stable'
  average: number
  highest: number
  lowest: number
}

export default function TrendsForecastsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('all_time')
  const { data: trendsData, isLoading } = useTrends(timeRange)

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

    if (!trendsData?.monthly_trends || trendsData.monthly_trends.length < 1) {
      return {
        spending: defaultMetrics,
        income: defaultMetrics,
        savings: defaultMetrics,
      }
    }

    const trends = trendsData.monthly_trends
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
    const savingsChangePercent = previous.surplus !== 0 ? (savingsChange / Math.abs(previous.surplus)) * 100 : 0

    const getDirection = (change: number): 'up' | 'down' | 'stable' => {
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
  }, [trendsData])

  // Prepare chart data for individual trend lines
  const chartData = useMemo(() => {
    if (!trendsData?.monthly_trends) return []
    
    const rawData = trendsData.monthly_trends.map((t, index, arr) => {
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
  }, [trendsData])

  const getTrendIcon = (direction: 'up' | 'down' | 'stable', isPositiveGood: boolean) => {
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

  const getTrendColor = (direction: 'up' | 'down' | 'stable', isPositiveGood: boolean) => {
    if (direction === 'stable') return 'text-gray-400'
    if (direction === 'up') return isPositiveGood ? 'text-green-500' : 'text-red-500'
    return isPositiveGood ? 'text-red-500' : 'text-green-500'
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader title="Trends & Forecasts" subtitle="Analyze patterns and predict future trends" />

        {/* Time Range Filter */}
        <motion.div className="flex gap-2 flex-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          {([
            'last_3_months',
            'last_6_months',
            'last_12_months',
            'this_year',
            'last_year',
            'all_time',
          ] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              type="button"
              className={`px-4 py-2 rounded-lg transition-all ${
                timeRange === range
                  ? 'glass-strong text-purple-400 border border-purple-500/30'
                  : 'glass text-gray-400 hover:text-gray-300'
              }`}
            >
              {range === 'last_3_months' && 'Last 3 Months'}
              {range === 'last_6_months' && 'Last 6 Months'}
              {range === 'last_12_months' && 'Last 12 Months'}
              {range === 'this_year' && 'This Year'}
              {range === 'last_year' && 'Last Year'}
              {range === 'all_time' && 'All Time'}
            </button>
          ))}
        </motion.div>

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
                  {metrics.spending.direction === 'up' ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : metrics.spending.direction === 'down' ? (
                    <ArrowDownRight className="w-4 h-4" />
                  ) : (
                    <Minus className="w-4 h-4" />
                  )}
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
                  {metrics.income.direction === 'up' ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : metrics.income.direction === 'down' ? (
                    <ArrowDownRight className="w-4 h-4" />
                  ) : (
                    <Minus className="w-4 h-4" />
                  )}
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
                  {metrics.savings.direction === 'up' ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : metrics.savings.direction === 'down' ? (
                    <ArrowDownRight className="w-4 h-4" />
                  ) : (
                    <Minus className="w-4 h-4" />
                  )}
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
            <h3 className="text-lg font-semibold text-white">Monthly Trends Overview</h3>
          </div>
          {isLoading && (
            <div className="h-80 flex items-center justify-center">
              <div className="animate-pulse text-gray-400">Loading chart...</div>
            </div>
          )}
          {!isLoading && chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
                <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={(v) => formatCurrencyShort(v)} />
                <Tooltip
                  {...chartTooltipProps}
                  formatter={(value: number | undefined, name: string | undefined) => [
                    value !== undefined ? formatCurrency(value) : '',
                    name === 'income' ? 'Income' : name === 'expenses' ? 'Spending' : 'Savings'
                  ]}
                />
                <Legend />
                <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} opacity={0.8} />
                <Bar dataKey="expenses" name="Spending" fill="#ef4444" radius={[4, 4, 0, 0]} opacity={0.8} />
                <Line type="monotone" dataKey="surplus" name="Savings" stroke="#a855f7" strokeWidth={3} dot={{ fill: '#a855f7', r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
          {!isLoading && chartData.length === 0 && (
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
          {!isLoading && chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
                <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={(v) => `${Math.round(v)}%`} domain={[0, 'auto']} />
                <Tooltip
                  {...chartTooltipProps}
                  formatter={(_value: number | undefined, _name: string | undefined, props: { payload?: { rawSavingsRate?: number } }) => {
                    const actual = props.payload?.rawSavingsRate ?? 0
                    const label = actual < 0 ? `${actual.toFixed(1)}% (deficit)` : `${actual.toFixed(1)}%`
                    return [label, 'Savings Rate']
                  }}
                />
                <defs>
                  <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area 
                  type="monotone" 
                  dataKey="savingsRate" 
                  stroke="#a855f7" 
                  fill="url(#savingsGradient)" 
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
          {!isLoading && chartData.length === 0 && (
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
                <tbody>
                  {chartData.slice(-8).map((trend) => (
                    <motion.tr
                      key={trend.month}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
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
                    </motion.tr>
                  ))}
                </tbody>
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
