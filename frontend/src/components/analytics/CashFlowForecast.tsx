import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { useMemo } from 'react'
import { useMonthlyAggregation } from '@/hooks/useAnalytics'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'

export default function CashFlowForecast() {
  const { data: monthlyData, isLoading } = useMonthlyAggregation()

  const forecastData = useMemo(() => {
    if (!monthlyData) return { historical: [], forecast: [], combined: [], insights: null }

    const months = Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        ...(data as { income: number; expense: number; net_savings: number }),
      }))
      .sort((a, b) => a.month.localeCompare(b.month))

    if (months.length < 3) return { historical: [], forecast: [], combined: [], insights: null }

    // Determine if current month is incomplete
    const today = new Date()
    const currentMonth = today.toISOString().slice(0, 7)
    const dayOfMonth = today.getDate()

    // Exclude current month from historical data if it's incomplete (< 25 days)
    const isCurrentMonthIncomplete = dayOfMonth < 25
    const lastMonth = months[months.length - 1]

    let historicalMonths = months
    let lastCompleteMonth = lastMonth

    if (lastMonth.month === currentMonth && isCurrentMonthIncomplete) {
      historicalMonths = months.slice(0, -1)
      lastCompleteMonth = historicalMonths[historicalMonths.length - 1]
    }

    if (historicalMonths.length < 3) return { historical: [], forecast: [], combined: [], insights: null }

    // Calculate trends using linear regression on last 6 complete months
    const recentMonths = historicalMonths.slice(-6)

    const avgIncome = recentMonths.reduce((sum, m) => sum + m.income, 0) / recentMonths.length
    const avgExpense = recentMonths.reduce((sum, m) => sum + m.expense, 0) / recentMonths.length
    const avgSavings = avgIncome - avgExpense

    // Calculate growth rates
    const incomeGrowth =
      recentMonths.length > 1
        ? (recentMonths[recentMonths.length - 1].income - recentMonths[0].income) /
          recentMonths[0].income /
          recentMonths.length
        : 0
    const expenseGrowth =
      recentMonths.length > 1
        ? (recentMonths[recentMonths.length - 1].expense - recentMonths[0].expense) /
          recentMonths[0].expense /
          recentMonths.length
        : 0

    // Generate 6-month forecast starting from the month AFTER the last complete month
    const lastDate = new Date(lastCompleteMonth.month + '-01')
    const forecast = []
    let projectedIncome = lastCompleteMonth.income
    let projectedExpense = lastCompleteMonth.expense

    // If current month is incomplete, include it as first forecast month
    const forecastStartOffset = lastMonth.month === currentMonth && isCurrentMonthIncomplete ? 0 : 1

    for (let i = forecastStartOffset; i <= forecastStartOffset + 5; i++) {
      const forecastDate = new Date(lastDate)
      forecastDate.setMonth(forecastDate.getMonth() + i)
      const monthStr = forecastDate.toISOString().slice(0, 7)

      // Apply growth with some dampening
      projectedIncome = projectedIncome * (1 + incomeGrowth * 0.5)
      projectedExpense = projectedExpense * (1 + expenseGrowth * 0.5)

      forecast.push({
        month: monthStr,
        income: Math.round(projectedIncome),
        expense: Math.round(projectedExpense),
        net_savings: Math.round(projectedIncome - projectedExpense),
        isForecast: true,
      })
    }

    // Historical data (last 12 complete months)
    const historical = historicalMonths.slice(-12).map((m) => ({
      ...m,
      isForecast: false,
    }))

    // Calculate insights
    const totalForecastSavings = forecast.reduce((sum, f) => sum + f.net_savings, 0)
    const monthsUntilNegative = forecast.findIndex((f) => f.net_savings < 0)

    return {
      historical,
      forecast,
      combined: [...historical, ...forecast],
      insights: {
        avgIncome,
        avgExpense,
        avgSavings,
        incomeGrowth: incomeGrowth * 100,
        expenseGrowth: expenseGrowth * 100,
        projectedSavings6m: totalForecastSavings,
        monthsUntilNegative: monthsUntilNegative === -1 ? null : monthsUntilNegative + 1,
        trend: avgSavings > 0 ? 'positive' : 'negative',
      },
    }
  }, [monthlyData])

  if (isLoading) {
    return (
      <div className="glass rounded-2xl border border-white/10 p-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3 mb-4" />
        <div className="h-64 bg-muted rounded" />
      </div>
    )
  }

  if (!forecastData.combined?.length) {
    return (
      <div className="glass rounded-2xl border border-white/10 p-6">
        <h3 className="text-lg font-semibold mb-2">Cash Flow Forecast</h3>
        <p className="text-muted-foreground">Need at least 3 months of data for forecasting.</p>
      </div>
    )
  }

  const { insights } = forecastData

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-white/10 p-6 shadow-xl"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${insights?.trend === 'positive' ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
            {insights?.trend === 'positive' ? (
              <TrendingUp className="w-6 h-6 text-green-500" />
            ) : (
              <TrendingDown className="w-6 h-6 text-red-500" />
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold">6-Month Cash Flow Forecast</h3>
            <p className="text-sm text-muted-foreground">Based on your spending patterns</p>
          </div>
        </div>
        {insights?.monthsUntilNegative && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-500 text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>Deficit in {insights.monthsUntilNegative} months</span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="h-64 mb-6">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={forecastData.combined}>
            <defs>
              <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={(v) => {
                const d = new Date(v + '-01')
                return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
              }}
            />
            <YAxis tickFormatter={(v) => formatCurrencyShort(v)} tick={{ fontSize: 10, fill: '#9ca3af' }} />
            <Tooltip
              formatter={(value: number | undefined, name: string | undefined) => [
                value !== undefined ? formatCurrency(value) : '',
                name === 'income' ? 'Income' : 'Expenses',
              ]}
              labelFormatter={(label) => {
                const d = new Date(label + '-01')
                const isForecast = forecastData.forecast.some((f) => f.month === label)
                return `${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}${isForecast ? ' (Forecast)' : ''}`
              }}
              contentStyle={{
                backgroundColor: 'rgba(0,0,0,0.9)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px',
                color: '#fff',
              }}
              itemStyle={{ color: '#fff' }}
              labelStyle={{ color: '#fff', fontWeight: 'bold' }}
            />
            <ReferenceLine
              x={forecastData.historical[forecastData.historical.length - 1]?.month}
              stroke="rgba(255,255,255,0.3)"
              strokeDasharray="3 3"
              label={{ value: 'Forecast →', position: 'top', fill: '#9ca3af', fontSize: 10 }}
            />
            <Area type="monotone" dataKey="income" stroke="#10b981" fill="url(#incomeGradient)" strokeWidth={2} />
            <Area type="monotone" dataKey="expense" stroke="#ef4444" fill="url(#expenseGradient)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Insights */}
      {insights && (
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
            <p className="text-xs text-muted-foreground mb-1">Avg Monthly Income</p>
            <p className="text-lg font-bold text-green-500">{formatCurrencyShort(insights.avgIncome)}</p>
            <p className="text-xs text-muted-foreground">
              {insights.incomeGrowth > 0 ? '↑' : '↓'} {Math.abs(insights.incomeGrowth).toFixed(1)}% trend
            </p>
          </div>
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-muted-foreground mb-1">Avg Monthly Expenses</p>
            <p className="text-lg font-bold text-red-500">{formatCurrencyShort(insights.avgExpense)}</p>
            <p className="text-xs text-muted-foreground">
              {insights.expenseGrowth > 0 ? '↑' : '↓'} {Math.abs(insights.expenseGrowth).toFixed(1)}% trend
            </p>
          </div>
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <p className="text-xs text-muted-foreground mb-1">6-Month Projected Savings</p>
            <p className={`text-lg font-bold ${insights.projectedSavings6m >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
              {formatCurrencyShort(insights.projectedSavings6m)}
            </p>
            <p className="text-xs text-muted-foreground">Based on current trends</p>
          </div>
        </div>
      )}
    </motion.div>
  )
}
