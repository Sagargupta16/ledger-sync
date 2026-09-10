import { useId, useMemo } from 'react'

import { motion } from 'motion/react'
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'

import { useMonthlyAggregation } from '@/hooks/api/useAnalytics'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import { CHART_LINE_CURSOR_STYLE } from '@/components/ui/ChartTooltip'
import ChartTooltipContent from '@/components/ui/ChartTooltipContent'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import { rawColors } from '@/constants/colors'
import { GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, areaGradient, areaGradientUrl, ACTIVE_DOT, currencyTooltipFormatter, referenceLine } from '@/components/ui/chartDefaults'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

import { buildForecast, formatMonth } from './cashFlowUtils'

export default function CashFlowForecast() {
  const chartId = useId().replaceAll(':', '')
  const { data: monthlyData, isLoading } = useMonthlyAggregation()

  const forecastData = useMemo(() => buildForecast(monthlyData), [monthlyData])
  const { animate, isMobile } = useChartPresentation(forecastData?.combined.length ?? 0)

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
      initial={animate ? { opacity: 0, y: 16 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: animate ? 0.3 : 0 }}
      className="ledger-panel overflow-hidden"
    >
      <div className="p-4 sm:p-5">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">Future cash flow</h3>
              {insights.trend === 'positive'
                ? <TrendingUp aria-hidden="true" className="size-4 shrink-0 text-app-green" />
                : <TrendingDown aria-hidden="true" className="size-4 shrink-0 text-app-red" />}
            </div>
            <p className="text-xs leading-relaxed text-text-tertiary">
              12 months ahead, based on your most recent complete months
            </p>
          </div>
          {insights.monthsUntilNegative && (
            <div className="flex items-center gap-2 rounded-md border border-app-orange/20 bg-app-orange/10 px-3 py-1.5 text-xs font-medium text-app-orange">
              <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
              Projected deficit in {insights.monthsUntilNegative}mo
            </div>
          )}
        </div>

        <ChartSeriesLegend
          items={[
            { key: 'income', label: 'Income', color: rawColors.app.green },
            { key: 'expense', label: 'Spending', color: rawColors.app.red },
            { key: 'net', label: 'Net savings', color: rawColors.app.blue },
            { key: 'forecast', label: 'Projected net', color: rawColors.app.purple },
          ]}
          caption={forecastData.forecastStartMonth
            ? `Projection starts ${formatMonth(forecastData.forecastStartMonth)}`
            : undefined}
        />
        <ChartContainer
          height={320}
          mobileHeight={260}
          ariaLabel="Historical and forecast cash flow showing income, expenses and net savings with a confidence band"
        >
          <AreaChart data={forecastData.combined} margin={{ top: 16, right: isMobile ? 8 : 16, bottom: 8, left: 0 }}>
            <defs>
              {areaGradient(`${chartId}-net`, rawColors.app.blue, 0.2, 0.02)}
              <linearGradient id={`${chartId}-cone`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={rawColors.app.blue} stopOpacity={0.12} />
                <stop offset="100%" stopColor={rawColors.app.blue} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID_DEFAULTS} />
            <XAxis {...xAxisDefaults(forecastData.combined.length)} dataKey="label" />
            <YAxis {...yAxisDefaults({ width: isMobile ? 48 : 56 })} />
            <Tooltip
              {...chartTooltipProps}
              cursor={CHART_LINE_CURSOR_STYLE}
              content={<ChartTooltipContent />}
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
            <Area type="monotone" dataKey="lowerBase" stackId="cone" stroke="none" fill="none" fillOpacity={0} connectNulls isAnimationActive={false} legendType="none" tooltipType="none" />
            <Area type="monotone" dataKey="bandRange" stackId="cone" stroke="none" fill={`url(#${chartId}-cone)`} fillOpacity={1} connectNulls isAnimationActive={false} legendType="none" tooltipType="none" />
            {/* Historical income/expense lines */}
            <Area type="monotone" dataKey="income" stroke={rawColors.app.green} strokeWidth={1.5} fill="none" dot={false} connectNulls isAnimationActive={animate} animationDuration={520} animationEasing="ease-out" strokeOpacity={0.8} legendType="none" />
            <Area type="monotone" dataKey="expense" stroke={rawColors.app.red} strokeWidth={1.5} fill="none" dot={false} connectNulls isAnimationActive={animate} animationDuration={520} animationEasing="ease-out" strokeOpacity={0.8} legendType="none" />
            {/* Forecast income/expense (dashed, faded) */}
            <Area type="monotone" dataKey="forecastIncome" stroke={rawColors.app.green} strokeWidth={1.5} strokeDasharray="6 4" fill="none" dot={false} connectNulls isAnimationActive={false} strokeOpacity={0.65} legendType="none" />
            <Area type="monotone" dataKey="forecastExpense" stroke={rawColors.app.red} strokeWidth={1.5} strokeDasharray="6 4" fill="none" dot={false} connectNulls isAnimationActive={false} strokeOpacity={0.65} legendType="none" />
            {/* Historical net savings (main line) */}
            <Area type="monotone" dataKey="net" stroke={rawColors.app.blue} strokeWidth={2.5} fill={areaGradientUrl(`${chartId}-net`)} fillOpacity={1} dot={false} activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.blue }} connectNulls isAnimationActive={animate} animationDuration={520} animationEasing="ease-out" legendType="none" />
            {/* Forecast net savings (dashed) */}
            <Area type="monotone" dataKey="forecastNet" stroke={rawColors.app.purple} strokeWidth={2.5} strokeDasharray="8 4" fill="none" dot={false} activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.purple }} connectNulls isAnimationActive={animate} animationDuration={520} animationEasing="ease-out" legendType="none" />
          </AreaChart>
        </ChartContainer>

        <p className="mt-3 text-xs leading-relaxed text-text-tertiary">
          Solid lines show recorded months. Dashed lines show projections; the shaded band shows the estimated range for net savings.
        </p>
        {chartDataTable(
          forecastData.combined,
          [
            { header: 'Month', rowHeader: true, value: (row) => row.label },
            { header: 'Basis', value: (row) => row.isForecast ? 'Projected' : 'Recorded' },
            { header: 'Income', value: (row) => formatCurrency(row.income ?? row.forecastIncome ?? 0) },
            { header: 'Spending', value: (row) => formatCurrency(row.expense ?? row.forecastExpense ?? 0) },
            { header: 'Net savings', value: (row) => formatCurrency(row.net ?? row.forecastNet ?? 0) },
            { header: 'Lower estimate', value: (row) => row.isForecast && row.lower !== undefined ? formatCurrency(row.lower) : 'Not applicable' },
            { header: 'Upper estimate', value: (row) => row.isForecast && row.upper !== undefined ? formatCurrency(row.upper) : 'Not applicable' },
          ],
          'Recorded cash flow and the 12 month projection',
          (row) => row.month,
        )}
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
