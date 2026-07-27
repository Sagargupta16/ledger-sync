import { motion } from 'motion/react'
import { PiggyBank } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import {
  areaGradient,
  areaGradientUrl,
  chartTooltipProps,
  ChartContainer,
  GRID_DEFAULTS,
  referenceLine,
  shouldAnimate,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { tooltipLabelString } from '@/lib/chartUtils'
import { formatDate } from '@/lib/formatters'

import type { useTrendsForecasts } from '../useTrendsForecasts'

type SavingsData = ReturnType<typeof useTrendsForecasts>['dailySavingsData']

interface SavingsRateSectionProps {
  readonly isLoading: boolean
  readonly data: SavingsData
  readonly savingsGoalPercent: number
}

export default function SavingsRateSection({
  isLoading,
  data,
  savingsGoalPercent,
}: SavingsRateSectionProps) {
  const dims = useChartDimensions()

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-20px' }}
      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <PiggyBank className="h-5 w-5 text-app-purple" />
        <h2 className="text-lg font-semibold text-foreground">Savings Rate Trend</h2>
        {/*
          The caption used to read "(% of income saved each month)". The series
          is CUMULATIVE to date -- each point is every rupee earned and spent
          from the start of the window up to that day, which is what the tooltip
          and the ariaLabel below already say, what `dailySavingsData` computes,
          and what three tests in `savingsRateCap.test.tsx` pin. A per-month
          series would move on a single heavy month; this one converges, so
          reading it as monthly makes a flattening line look like an unchanging
          month. Label follows the maths, not the other way round.
        */}
        <span className="text-sm text-text-tertiary">
          (running % of income saved, start of range to date)
        </span>
      </div>

      {isLoading && <ChartSkeleton height="h-64" />}
      {!isLoading && data.length > 0 && (
        <ChartContainer
          height={250}
          ariaLabel="Cumulative savings rate over time as a percentage of income, with savings-goal target line"
        >
          <AreaChart data={data}>
            <defs>{areaGradient('savingsRate', rawColors.app.purple, 0.4, 0.02)}</defs>
            <CartesianGrid {...GRID_DEFAULTS} />
            <XAxis
              {...xAxisDefaults(data.length, {
                angle: dims.angleXLabels ? -45 : undefined,
                height: 70,
                dateFormatter: true,
              })}
              dataKey="date"
            />
            {/*
              Domain is `auto` at BOTH ends, not `[0, 'auto']`. A cumulative
              deficit is a real outcome (the live ledger has 6 such days) and a
              floor of 0 clipped it flat onto the axis while the tooltip below
              still reported the negative figure. Recharts then draws no
              baseline of its own, so the zero reference line is what makes
              "above water" readable at a glance.
            */}
            <YAxis
              {...yAxisDefaults({ currency: false })}
              tickFormatter={(value: number) => `${Math.round(value)}%`}
              domain={['auto', 'auto']}
            />
            <Tooltip
              {...chartTooltipProps}
              // Label is the `date` axis tick value at runtime; formatDate
              // returns its input unchanged for anything not YYYY-MM-DD.
              labelFormatter={(label) =>
                formatDate(tooltipLabelString(label), {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })
              }
              // Reads the plotted value directly. It used to reach past it into
              // `payload.rawSavingsRate` because the series itself was clamped
              // at 0, which let the tooltip contradict the line it labelled.
              formatter={(value) => {
                const actual = typeof value === 'number' ? value : Number(value) || 0
                const label =
                  actual < 0 ? `${actual.toFixed(1)}% (deficit)` : `${actual.toFixed(1)}%`
                return [label, 'Cumulative Savings Rate']
              }}
            />
            {referenceLine({ y: 0, variant: 'zero' })}
            {referenceLine({
              y: savingsGoalPercent,
              label: `Target: ${savingsGoalPercent}%`,
              variant: 'goal',
            })}
            <Area
              type="monotone"
              dataKey="savingsRate"
              stroke={rawColors.app.purple}
              fill={areaGradientUrl('savingsRate')}
              strokeWidth={2}
              dot={data.length === 1 ? { r: 3, fill: rawColors.app.purple } : false}
              isAnimationActive={shouldAnimate(data.length)}
              animationDuration={600}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ChartContainer>
      )}
      {!isLoading && data.length === 0 && <ChartEmptyState height={250} />}
    </motion.section>
  )
}
