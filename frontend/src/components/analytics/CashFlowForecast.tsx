import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { useMemo } from 'react'
import { useMonthlyAggregation } from '@/hooks/useAnalytics'
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import { SEMANTIC_COLORS } from '@/constants/chartColors'
import { GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, areaGradient, areaGradientUrl, shouldAnimate } from '@/components/ui/chartDefaults'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

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
    const lastMonth = months.at(-1)!

    let historicalMonths = months
    let lastCompleteMonth = lastMonth

    if (lastMonth.month === currentMonth && isCurrentMonthIncomplete) {
      historicalMonths = months.slice(0, -1)
      lastCompleteMonth = historicalMonths.at(-1)!
    }

    if (historicalMonths.length < 3) return { historical: [], forecast: [], combined: [], insights: null }

    // Calculate trends using linear regression on last 6 complete months
    const recentMonths = historicalMonths.slice(-6)

    const avgIncome = recentMonths.reduce((sum, m) => sum + m.income, 0) / recentMonths.length
    const avgExpense = recentMonths.reduce((sum, m) => sum + m.expense, 0) / recentMonths.length
    const avgSavings = avgIncome - avgExpense

    // Calculate growth rates
    const incomeGrowth =
      recentMonths.length > 1 && recentMonths[0].income > 0
        ? (recentMonths.at(-1)!.income - recentMonths[0].income) /
          recentMonths[0].income /
          (recentMonths.length - 1)
        : 0
    const expenseGrowth =
      recentMonths.length > 1 && recentMonths[0].expense > 0
        ? (recentMonths.at(-1)!.expense - recentMonths[0].expense) /
          recentMonths[0].expense /
          (recentMonths.length - 1)
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
      combined: [...historical, ...forecast].map((d, i, arr) => {
        // For the last historical point and all forecast points, add forecast keys
        // so dashed overlay lines connect from the boundary
        const isLastHistorical = !d.isForecast && arr[i + 1]?.isForecast
        const showForecast = d.isForecast || isLastHistorical
        return {
          ...d,
          forecastIncome: showForecast ? d.income : undefined,
          forecastExpense: showForecast ? d.expense : undefined,
        }
      }),
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
      <div className="glass rounded-2xl border border-border p-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3 mb-4" />
        <div className="h-64 bg-muted rounded" />
      </div>
    )
  }

  if (!forecastData.combined?.length) {
    return (
      <div className="glass rounded-2xl border border-border p-6">
        <h3 className="text-lg font-semibold mb-2">Cash Flow Forecast</h3>
        <ChartEmptyState message="Need at least 3 months of data for forecasting." />
      </div>
    )
  }

  const { insights } = forecastData

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-6 shadow-xl"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${insights?.trend === 'positive' ? 'bg-ios-green/20' : 'bg-ios-red/20'}`}>
            {insights?.trend === 'positive' ? (
              <TrendingUp className="w-6 h-6 text-ios-green" />
            ) : (
              <TrendingDown className="w-6 h-6 text-ios-red" />
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold">6-Month Cash Flow Forecast</h3>
            <p className="text-sm text-muted-foreground">Based on your spending patterns</p>
          </div>
        </div>
        {insights?.monthsUntilNegative && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-ios-yellow/20 text-ios-yellow text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>Deficit in {insights.monthsUntilNegative} months</span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="h-64 mb-6">
        <ChartContainer>
          <AreaChart data={forecastData.combined}>
            <defs>
              {areaGradient('income', SEMANTIC_COLORS.income)}
              {areaGradient('expense', SEMANTIC_COLORS.expense)}
            </defs>
            <CartesianGrid {...GRID_DEFAULTS} />
            <XAxis
              {...xAxisDefaults(forecastData.combined.length)}
              dataKey="month"
              tickFormatter={(v) => {
                const d = new Date(v + '-01')
                return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
              }}
            />
            <YAxis {...yAxisDefaults()} />
            <Tooltip
              {...chartTooltipProps}
              formatter={(value: number | undefined, name: string | undefined) => [
                value === undefined ? '' : formatCurrency(value),
                name === 'income' ? 'Income' : 'Expenses',
              ]}
              labelFormatter={(label) => {
                const d = new Date(label + '-01')
                const isForecast = forecastData.forecast.some((f) => f.month === label)
                return `${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}${isForecast ? ' (Forecast)' : ''}`
              }}
            />
            <ReferenceLine
              x={forecastData.historical.at(-1)?.month}
              stroke="rgba(255,255,255,0.3)"
              strokeDasharray="3 3"
              label={{ value: 'Forecast →', position: 'top', fill: '#71717a', fontSize: 10 }}
            />
            <Area type="monotone" dataKey="income" stroke={SEMANTIC_COLORS.income} fill={areaGradientUrl('income')} strokeWidth={2} dot={false} animationDuration={600} animationEasing="ease-out" isAnimationActive={shouldAnimate(forecastData.combined.length)} />
            <Area type="monotone" dataKey="expense" stroke={SEMANTIC_COLORS.expense} fill={areaGradientUrl('expense')} strokeWidth={2} dot={false} animationDuration={600} animationEasing="ease-out" isAnimationActive={shouldAnimate(forecastData.combined.length)} />
            <Line type="monotone" dataKey="forecastIncome" stroke={SEMANTIC_COLORS.income} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} legendType="none" />
            <Line type="monotone" dataKey="forecastExpense" stroke={SEMANTIC_COLORS.expense} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} legendType="none" />
          </AreaChart>
        </ChartContainer>
      </div>

      {/* Insights */}
      {insights && (
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 rounded-xl bg-ios-green/10 border border-ios-green/20">
            <p className="text-xs text-muted-foreground mb-1">Avg Monthly Income</p>
            <p className="text-lg font-bold text-ios-green">{formatCurrencyShort(insights.avgIncome)}</p>
            <p className="text-xs text-muted-foreground">
              {insights.incomeGrowth > 0 ? '↑' : '↓'} {Math.abs(insights.incomeGrowth).toFixed(1)}% trend
            </p>
          </div>
          <div className="p-3 rounded-xl bg-ios-red/10 border border-ios-red/20">
            <p className="text-xs text-muted-foreground mb-1">Avg Monthly Expenses</p>
            <p className="text-lg font-bold text-ios-red">{formatCurrencyShort(insights.avgExpense)}</p>
            <p className="text-xs text-muted-foreground">
              {insights.expenseGrowth > 0 ? '↑' : '↓'} {Math.abs(insights.expenseGrowth).toFixed(1)}% trend
            </p>
          </div>
          <div className="p-3 rounded-xl bg-ios-blue/10 border border-ios-blue/20">
            <p className="text-xs text-muted-foreground mb-1">6-Month Projected Savings</p>
            <p className={`text-lg font-bold ${insights.projectedSavings6m >= 0 ? 'text-ios-blue' : 'text-ios-red'}`}>
              {formatCurrencyShort(insights.projectedSavings6m)}
            </p>
            <p className="text-xs text-muted-foreground">Based on current trends</p>
          </div>
        </div>
      )}
    </motion.div>
  )
}
