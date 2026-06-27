import { useMemo } from 'react'

import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'

import { useMonthlyAggregation } from '@/hooks/api/useAnalytics'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, areaGradient, areaGradientUrl, shouldAnimate, ACTIVE_DOT } from '@/components/ui/chartDefaults'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

import { buildForecast, formatMonth } from './cashFlowUtils'

export default function CashFlowForecast() {
  const { data: monthlyData, isLoading } = useMonthlyAggregation()

  const forecastData = useMemo(() => buildForecast(monthlyData), [monthlyData])

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
            <div className={`p-3 rounded-xl ${insights.trend === 'positive' ? 'bg-app-green/10' : 'bg-app-red/10'}`}>
              {insights.trend === 'positive'
                ? <TrendingUp className="w-6 h-6 text-app-green" />
                : <TrendingDown className="w-6 h-6 text-app-red" />}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Future Cash Flow Forecast</h3>
              <p className="text-xs text-text-tertiary">Projected income, expenses & net savings</p>
            </div>
          </div>
          {insights.monthsUntilNegative && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-app-orange/10 border border-app-orange/20 text-app-orange text-xs font-medium">
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
              formatter={(value, name) => {
                if (typeof value !== 'number') return ['', '']
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
            <span className="w-3 h-1.5 rounded-sm bg-app-blue/15" />{' '}
            Confidence
          </span>
        </div>
      </div>

      {/* ── Insight Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        <div className="bg-white/[0.04] border border-border rounded-xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-quaternary mb-1">Avg Monthly Income</p>
          <p className="text-xl font-bold text-app-green">{formatCurrencyShort(insights.avgIncome)}</p>
          <p className="text-xs text-text-tertiary mt-1">
            {insights.incomeGrowth >= 0 ? '↑' : '↓'} {Math.abs(insights.incomeGrowth).toFixed(1)}% monthly trend
          </p>
        </div>
        <div className="bg-white/[0.04] border border-border rounded-xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-quaternary mb-1">Avg Monthly Expenses</p>
          <p className="text-xl font-bold text-app-red">{formatCurrencyShort(insights.avgExpense)}</p>
          <p className="text-xs text-text-tertiary mt-1">
            {insights.expenseGrowth >= 0 ? '↑' : '↓'} {Math.abs(insights.expenseGrowth).toFixed(1)}% monthly trend
          </p>
        </div>
        <div className="bg-white/[0.04] border border-border rounded-xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-quaternary mb-1">1-Year Projected Savings</p>
          <p className={`text-xl font-bold ${insights.projectedSavings >= 0 ? 'text-app-blue' : 'text-app-red'}`}>
            {insights.projectedSavings >= 0 ? '+' : ''}{formatCurrencyShort(insights.projectedSavings)}
          </p>
          <p className="text-xs text-text-tertiary mt-1">Based on current trends</p>
        </div>
      </div>
    </motion.div>
  )
}
