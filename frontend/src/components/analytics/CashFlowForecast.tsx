import { useMemo } from 'react'

import { motion } from 'motion/react'
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'

import { useMonthlyAggregation } from '@/hooks/api/useAnalytics'
import { formatCurrencyShort } from '@/lib/formatters'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, areaGradient, areaGradientUrl, shouldAnimate, ACTIVE_DOT, currencyTooltipFormatter, referenceLine } from '@/components/ui/chartDefaults'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

import { buildForecast, formatMonth } from './cashFlowUtils'

export default function CashFlowForecast() {
  const { data: monthlyData, isLoading } = useMonthlyAggregation()

  const forecastData = useMemo(() => buildForecast(monthlyData), [monthlyData])

  if (isLoading) {
    return <div className="ledger-panel animate-pulse p-4 sm:p-5"><div className="mb-4 h-8 w-1/3 rounded bg-[var(--overlay-2)]" /><div className="h-64 rounded bg-[var(--overlay-2)]" /></div>
  }

  if (!forecastData) {
    return (
      <div className="ledger-panel p-4 sm:p-5">
        <h3 className="mb-2 text-base font-semibold text-foreground">Cash Flow Forecast</h3>
        <ChartEmptyState message="Need at least 3 months of data for forecasting." />
      </div>
    )
  }

  const { insights } = forecastData

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="ledger-panel overflow-hidden"
    >
      <div className="p-4 sm:p-5">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex size-8 shrink-0 items-center justify-center rounded-md ${insights.trend === 'positive' ? 'bg-app-green/10' : 'bg-app-red/10'}`}>
              {insights.trend === 'positive'
                ? <TrendingUp className="size-4 text-app-green" />
                : <TrendingDown className="size-4 text-app-red" />}
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Future cash flow</h3>
              <p className="text-xs text-text-tertiary">Projected income, spending, and net savings</p>
            </div>
          </div>
          {insights.monthsUntilNegative && (
            <div className="flex items-center gap-2 rounded-md border border-app-orange/20 bg-app-orange/10 px-3 py-1.5 text-xs font-medium text-app-orange">
              <AlertTriangle className="size-3.5" />
              Deficit in {insights.monthsUntilNegative}mo
            </div>
          )}
        </div>

        {/* ── Net Savings Chart with Confidence Cone ──────────────── */}
        <ChartContainer
          height={280}
          ariaLabel="Historical and forecast cash flow showing income, expenses and net savings with a confidence band"
        >
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
                return [currencyTooltipFormatter(value), labels[name ?? ''] ?? name]
              }}
            />
            {referenceLine({ y: 0, variant: 'zero' })}
            {forecastData.forecastStartMonth && (
              <ReferenceLine
                x={formatMonth(forecastData.forecastStartMonth)}
                stroke={rawColors.chart.referenceLineStrong}
                strokeDasharray="4 4"
              />
            )}
            {/* Confidence band as two STACKED areas: a transparent baseline at
                `lower`, then the band height (`upper - lower`) stacked on top.
                Stacking sits the visible band on the baseline regardless of sign,
                so the cone renders correctly above, below, or across zero -- the
                old approach faked it with a black mask Area that painted a solid
                black wedge below zero whenever the forecast dipped negative. */}
            <Area type="monotone" dataKey="lowerBase" stackId="cone" stroke="none" fill="none" fillOpacity={0} connectNulls isAnimationActive={false} legendType="none" />
            <Area type="monotone" dataKey="bandRange" stackId="cone" stroke="none" fill="url(#gradient-cone)" fillOpacity={1} connectNulls isAnimationActive={false} legendType="none" />
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

      <div className="grid grid-cols-1 border-t border-[var(--hairline-1)] sm:grid-cols-3">
        <div className="p-4 sm:border-r sm:border-[var(--hairline-1)]">
          <p className="ledger-meta mb-1 text-text-quaternary">Avg monthly income</p>
          <p className="ledger-figure text-xl font-semibold text-app-green">{formatCurrencyShort(insights.avgIncome)}</p>
          <p className="mt-1 text-xs text-text-tertiary">
            {insights.incomeGrowth >= 0 ? '↑' : '↓'} {Math.abs(insights.incomeGrowth).toFixed(1)}% monthly trend
          </p>
        </div>
        <div className="border-t border-[var(--hairline-1)] p-4 sm:border-t-0 sm:border-r">
          <p className="ledger-meta mb-1 text-text-quaternary">Avg monthly spending</p>
          <p className="ledger-figure text-xl font-semibold text-app-red">{formatCurrencyShort(insights.avgExpense)}</p>
          <p className="mt-1 text-xs text-text-tertiary">
            {insights.expenseGrowth >= 0 ? '↑' : '↓'} {Math.abs(insights.expenseGrowth).toFixed(1)}% monthly trend
          </p>
        </div>
        <div className="border-t border-[var(--hairline-1)] p-4 sm:border-t-0">
          <p className="ledger-meta mb-1 text-text-quaternary">1-year projected savings</p>
          <p className={`ledger-figure text-xl font-semibold ${insights.projectedSavings >= 0 ? 'text-app-blue' : 'text-app-red'}`}>
            {insights.projectedSavings >= 0 ? '+' : ''}{formatCurrencyShort(insights.projectedSavings)}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">Based on current trends</p>
        </div>
      </div>
    </motion.section>
  )
}
