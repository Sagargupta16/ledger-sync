import { motion } from 'framer-motion'
import { TrendingUp } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, Line, Tooltip, XAxis, YAxis } from 'recharts'

import EmptyState from '@/components/shared/EmptyState'
import {
  ChartContainer,
  GRID_DEFAULTS,
  areaGradient,
  areaGradientUrl,
  chartTooltipProps,
  currencyTooltipFormatter,
  referenceLine,
  shouldAnimate,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { formatMonthKey } from '@/lib/dateUtils'
import { formatCurrencyShort } from '@/lib/formatters'

import type { MonthlyIncomeDatum } from '../useIncomeAnalysis'

interface IncomeTrendSectionProps {
  readonly data: readonly MonthlyIncomeDatum[]
  readonly peakIncome: number
  readonly avgIncome: number
}

export default function IncomeTrendSection({
  data,
  peakIncome,
  avgIncome,
}: IncomeTrendSectionProps) {
  const dimensions = useChartDimensions()

  return (
    <motion.section
      className="glass rounded-xl border border-border p-4 md:p-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      aria-labelledby="income-trend-title"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="size-5 text-app-green" aria-hidden="true" />
          <div>
            <h2 id="income-trend-title" className="text-lg font-semibold text-foreground">
              Income Trend
            </h2>
            <p className="text-pretty text-sm text-text-tertiary">
              Monthly income with 3-month rolling average
            </p>
          </div>
        </div>

        {data.length > 0 ? (
          <ChartContainer
            height={dimensions.chartHeight}
            ariaLabel="Monthly income over time with a 3-month rolling average, plus peak and average reference lines."
          >
            <AreaChart data={data} margin={dimensions.margin}>
              <defs>{areaGradient('incomeTrend', rawColors.app.green, 0.4, 0)}</defs>
              <CartesianGrid {...GRID_DEFAULTS} />
              <XAxis {...xAxisDefaults(data.length)} dataKey="label" />
              <YAxis {...yAxisDefaults()} />
              <Tooltip
                {...chartTooltipProps}
                labelFormatter={(
                  _label: unknown,
                  payload: ReadonlyArray<{ payload?: { month?: string } }>,
                ) => {
                  const month = payload?.[0]?.payload?.month
                  return month ? formatMonthKey(month, { month: 'long', year: 'numeric' }) : ''
                }}
                formatter={(value, name) => [
                  currencyTooltipFormatter(value),
                  name === 'incomeAvg' ? 'Income (3m avg)' : 'Income',
                ]}
                itemSorter={(item) => -(item.value as number)}
              />
              {referenceLine({
                y: peakIncome,
                label: `Peak: ${formatCurrencyShort(peakIncome)}`,
                variant: 'peak',
              })}
              {avgIncome > 0 &&
                referenceLine({
                  y: avgIncome,
                  label: `Avg: ${formatCurrencyShort(avgIncome)}`,
                  variant: 'avg',
                })}
              <Area
                type="monotone"
                dataKey="income"
                stroke={rawColors.app.green}
                fill={areaGradientUrl('incomeTrend')}
                strokeWidth={2}
                dot={data.length === 1 ? { r: 3, fill: rawColors.app.green } : false}
                isAnimationActive={shouldAnimate(data.length)}
                animationDuration={600}
                animationEasing="ease-out"
              />
              <Line
                type="monotone"
                dataKey="incomeAvg"
                stroke={rawColors.app.green}
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={data.length === 1 ? { r: 3, fill: rawColors.app.green } : false}
                name="Income (3m avg)"
                isAnimationActive={shouldAnimate(data.length)}
                animationDuration={600}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <EmptyState
            icon={TrendingUp}
            title="No income data available"
            description="Start by uploading your transaction data to see income trends."
            actionLabel="Upload Data"
            actionHref="/upload"
            variant="chart"
          />
        )}
      </div>
    </motion.section>
  )
}
