import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { useMemo } from 'react'
import { useMonthlyAggregation } from '@/hooks/api/useAnalytics'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, areaGradient, areaGradientUrl, shouldAnimate, ACTIVE_DOT } from '@/components/ui/chartDefaults'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

function formatMonth(v: string) {
  const d = new Date(v + '-01')
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function computeGrowthRate(series: Array<{ income: number; expense: number }>) {
  if (series.length <= 1) return { incomeGrowth: 0, expenseGrowth: 0 }
  const first = series[0]
  const last = series.at(-1) ?? first
  const periods = series.length - 1
  return {
    incomeGrowth: first.income > 0 ? (last.income - first.income) / first.income / periods : 0,
    expenseGrowth: first.expense > 0 ? (last.expense - first.expense) / first.expense / periods : 0,
  }
}

export default function CashFlowForecast() {
  const { data: monthlyData, isLoading } = useMonthlyAggregation()

  const forecastData = useMemo(() => {
    if (!monthlyData) return null

    const months = Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        ...(data as { income: number; expense: number; net_savings: number }),
      }))
      .sort((a, b) => a.month.localeCompare(b.month))

    if (months.length < 3) return null

    // Exclude incomplete current month
    const today = new Date()
    const currentMonth = today.toISOString().slice(0, 7)
    const isIncomplete = today.getDate() < 25
    const last = months.at(-1)
    if (!last) return null
    const historicalMonths = (last.month === currentMonth && isIncomplete)
      ? months.slice(0, -1) : months
    const lastComplete = historicalMonths.at(-1)
    if (!lastComplete) return null

    if (historicalMonths.length < 3) return null

    // Trend from last 6 complete months
    const recent = historicalMonths.slice(-6)
    const avgIncome = recent.reduce((s, m) => s + m.income, 0) / recent.length
    const avgExpense = recent.reduce((s, m) => s + m.expense, 0) / recent.length
    const avgSavings = avgIncome - avgExpense

    const { incomeGrowth, expenseGrowth } = computeGrowthRate(recent)

    // Volatility for confidence bands
    const savingsValues = recent.map(m => m.income - m.expense)
    const savingsAvg = savingsValues.reduce((s, v) => s + v, 0) / savingsValues.length
    const variance = savingsValues.reduce((s, v) => s + (v - savingsAvg) ** 2, 0) / savingsValues.length
    const stdDev = Math.sqrt(variance)

    // Generate 6-month forecast
    const lastDate = new Date(lastComplete.month + '-01')
    const offset = (last.month === currentMonth && isIncomplete) ? 0 : 1
    const forecast = []
    let projIncome = lastComplete.income
    let projExpense = lastComplete.expense

    for (let i = offset; i <= offset + 11; i++) {
      const fd = new Date(lastDate)
      fd.setMonth(fd.getMonth() + i)
      const ms = fd.toISOString().slice(0, 7)
      projIncome = projIncome * (1 + incomeGrowth * 0.5)
      projExpense = projExpense * (1 + expenseGrowth * 0.5)
      const net = projIncome - projExpense
      const monthsOut = i - offset + 1
      // Confidence band widens over time
      const band = stdDev * 0.8 * Math.sqrt(monthsOut)
      forecast.push({
        month: ms,
        income: Math.round(projIncome),
        expense: Math.round(projExpense),
        net: Math.round(net),
        upper: Math.round(net + band),
        lower: Math.round(net - band),
        isForecast: true,
      })
    }

    // Historical (last 12)
    const historical = historicalMonths.slice(-12).map(m => ({
      month: m.month,
      income: m.income,
      expense: m.expense,
      net: m.income - m.expense,
      isForecast: false,
    }))

    // Combined data with income, expense, net + forecast variants
    const lastHist = historical.at(-1)
    if (!lastHist) return null
    type CombinedPoint = {
      month: string; label: string; isForecast: boolean
      income: number | undefined; expense: number | undefined; net: number | undefined
      forecastIncome: number | undefined; forecastExpense: number | undefined; forecastNet: number | undefined
      upper: number | undefined; lower: number | undefined
    }
    const combined: CombinedPoint[] = [
      ...historical.map(h => ({
        month: h.month, label: formatMonth(h.month), isForecast: false,
        income: h.income, expense: h.expense, net: h.net,
        forecastIncome: undefined as number | undefined, forecastExpense: undefined as number | undefined,
        forecastNet: undefined as number | undefined,
        upper: undefined as number | undefined, lower: undefined as number | undefined,
      })),
      // Bridge point
      {
        month: lastHist.month, label: formatMonth(lastHist.month), isForecast: false,
        income: lastHist.income, expense: lastHist.expense, net: lastHist.net,
        forecastIncome: lastHist.income, forecastExpense: lastHist.expense, forecastNet: lastHist.net,
        upper: lastHist.net, lower: lastHist.net,
      },
      ...forecast.map(f => ({
        month: f.month, label: formatMonth(f.month), isForecast: true,
        income: undefined as number | undefined, expense: undefined as number | undefined, net: undefined as number | undefined,
        forecastIncome: f.income, forecastExpense: f.expense, forecastNet: f.net,
        upper: f.upper, lower: f.lower,
      })),
    ]
    // Remove duplicate bridge
    combined.splice(historical.length - 1, 1)

    // Bar data — last 6 historical + 6 forecast
    const barData = [
      ...historical.slice(-6).map(h => ({ month: h.month, label: formatMonth(h.month), income: h.income, expense: h.expense, isForecast: false })),
      ...forecast.map(f => ({ month: f.month, label: formatMonth(f.month), income: f.income, expense: f.expense, isForecast: true })),
    ]

    const totalForecastSavings = forecast.reduce((s, f) => s + f.net, 0)
    const monthsUntilNegative = forecast.findIndex(f => f.net < 0)

    return {
      combined, barData,
      forecastStartMonth: forecast[0]?.month,
      insights: {
        avgIncome, avgExpense, avgSavings,
        incomeGrowth: incomeGrowth * 100,
        expenseGrowth: expenseGrowth * 100,
        projectedSavings: totalForecastSavings,
        monthsUntilNegative: monthsUntilNegative === -1 ? null : monthsUntilNegative + 1,
        trend: avgSavings > 0 ? 'positive' as const : 'negative' as const,
      },
    }
  }, [monthlyData])

  if (isLoading) {
    return <div className="glass rounded-2xl p-6 animate-pulse"><div className="h-8 bg-white/[0.04] rounded w-1/3 mb-4" /><div className="h-64 bg-white/[0.04] rounded" /></div>
  }

  if (!forecastData) {
    return (
      <div className="glass rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-2">Cash Flow Forecast</h3>
        <ChartEmptyState message="Need at least 3 months of data for forecasting." />
      </div>
    )
  }

  const { insights } = forecastData

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${insights.trend === 'positive' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              {insights.trend === 'positive'
                ? <TrendingUp className="w-6 h-6 text-green-400" />
                : <TrendingDown className="w-6 h-6 text-red-400" />}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Future Cash Flow Forecast</h3>
              <p className="text-xs text-text-tertiary">Projected income, expenses & net savings</p>
            </div>
          </div>
          {insights.monthsUntilNegative && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              Deficit in {insights.monthsUntilNegative}mo
            </div>
          )}
        </div>

        {/* ── Net Savings Chart with Confidence Cone ──────────────── */}
        <ChartContainer height={280}>
          <AreaChart data={forecastData.combined} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
            <defs>
              {areaGradient('netSavings', rawColors.app.blue, 0.2, 0.02)}
              <linearGradient id="gradient-cone" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={rawColors.app.blue} stopOpacity={0.12} />
                <stop offset="100%" stopColor={rawColors.app.blue} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID_DEFAULTS} />
            <XAxis {...xAxisDefaults(forecastData.combined.length)} dataKey="label" />
            <YAxis {...yAxisDefaults()} />
            <Tooltip
              {...chartTooltipProps}
              formatter={(value: number | undefined, name: string | undefined) => {
                if (value === undefined) return ['', '']
                const labels: Record<string, string> = {
                  income: 'Income', expense: 'Expenses', net: 'Net Savings',
                  forecastIncome: 'Income (Forecast)', forecastExpense: 'Expenses (Forecast)',
                  forecastNet: 'Net (Forecast)', upper: 'Optimistic', lower: 'Conservative',
                }
                return [formatCurrency(value), labels[name ?? ''] ?? name]
              }}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
            {forecastData.forecastStartMonth && (
              <ReferenceLine
                x={formatMonth(forecastData.forecastStartMonth)}
                stroke="rgba(255,255,255,0.2)"
                strokeDasharray="4 4"
              />
            )}
            {/* Confidence band (upper/lower) */}
            <Area type="monotone" dataKey="upper" stroke="none" fill="url(#gradient-cone)" fillOpacity={1} connectNulls isAnimationActive={false} legendType="none" />
            <Area type="monotone" dataKey="lower" stroke="none" fill="#000" fillOpacity={0.8} connectNulls isAnimationActive={false} legendType="none" />
            {/* Historical income/expense lines */}
            <Area type="monotone" dataKey="income" stroke={rawColors.app.green} strokeWidth={1.5} fill="none" dot={false} connectNulls isAnimationActive={shouldAnimate(forecastData.combined.length)} animationDuration={600} strokeOpacity={0.5} legendType="none" />
            <Area type="monotone" dataKey="expense" stroke={rawColors.app.red} strokeWidth={1.5} fill="none" dot={false} connectNulls isAnimationActive={shouldAnimate(forecastData.combined.length)} animationDuration={600} strokeOpacity={0.5} legendType="none" />
            {/* Forecast income/expense (dashed, faded) */}
            <Area type="monotone" dataKey="forecastIncome" stroke={rawColors.app.green} strokeWidth={1.5} strokeDasharray="6 4" fill="none" dot={false} connectNulls isAnimationActive={false} strokeOpacity={0.35} legendType="none" />
            <Area type="monotone" dataKey="forecastExpense" stroke={rawColors.app.red} strokeWidth={1.5} strokeDasharray="6 4" fill="none" dot={false} connectNulls isAnimationActive={false} strokeOpacity={0.35} legendType="none" />
            {/* Historical net savings (main line) */}
            <Area type="monotone" dataKey="net" stroke={rawColors.app.blue} strokeWidth={2.5} fill={areaGradientUrl('netSavings')} fillOpacity={1} dot={false} activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.blue }} connectNulls isAnimationActive={shouldAnimate(forecastData.combined.length)} animationDuration={600} legendType="none" />
            {/* Forecast net savings (dashed) */}
            <Area type="monotone" dataKey="forecastNet" stroke={rawColors.app.purple} strokeWidth={2} strokeDasharray="8 4" fill="none" dot={false} activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.purple }} connectNulls isAnimationActive={shouldAnimate(forecastData.combined.length)} animationDuration={600} legendType="none" />
          </AreaChart>
        </ChartContainer>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 mt-3 text-[11px] text-text-tertiary">
          <span className="flex items-center gap-1.5">{' '}
            <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: rawColors.app.green, opacity: 0.5 }} />{' '}
            Income
          </span>
          <span className="flex items-center gap-1.5">{' '}
            <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: rawColors.app.red, opacity: 0.5 }} />{' '}
            Expenses
          </span>
          <span className="flex items-center gap-1.5">{' '}
            <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: rawColors.app.blue }} />{' '}
            Net Savings
          </span>
          <span className="flex items-center gap-1.5">{' '}
            <span className="w-3 h-0 border-t border-dashed" style={{ borderColor: rawColors.app.purple }} />{' '}
            Forecast
          </span>
          <span className="flex items-center gap-1.5">{' '}
            <span className="w-3 h-1.5 rounded-sm bg-blue-500/15" />{' '}
            Confidence
          </span>
        </div>
      </div>

      {/* ── Insight Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        <div className="bg-white/[0.04] border border-border rounded-xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-quaternary mb-1">Avg Monthly Income</p>
          <p className="text-xl font-bold text-green-400">{formatCurrencyShort(insights.avgIncome)}</p>
          <p className="text-xs text-text-tertiary mt-1">
            {insights.incomeGrowth >= 0 ? '↑' : '↓'} {Math.abs(insights.incomeGrowth).toFixed(1)}% monthly trend
          </p>
        </div>
        <div className="bg-white/[0.04] border border-border rounded-xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-quaternary mb-1">Avg Monthly Expenses</p>
          <p className="text-xl font-bold text-red-400">{formatCurrencyShort(insights.avgExpense)}</p>
          <p className="text-xs text-text-tertiary mt-1">
            {insights.expenseGrowth >= 0 ? '↑' : '↓'} {Math.abs(insights.expenseGrowth).toFixed(1)}% monthly trend
          </p>
        </div>
        <div className="bg-white/[0.04] border border-border rounded-xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-quaternary mb-1">1-Year Projected Savings</p>
          <p className={`text-xl font-bold ${insights.projectedSavings >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
            {insights.projectedSavings >= 0 ? '+' : ''}{formatCurrencyShort(insights.projectedSavings)}
          </p>
          <p className="text-xs text-text-tertiary mt-1">Based on current trends</p>
        </div>
      </div>
    </motion.div>
  )
}
