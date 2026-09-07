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
    <section className="ledger-panel p-4 sm:p-5" aria-labelledby="savings-rate-trend-title">
      <div className="mb-4 flex items-start gap-2.5">
        <PiggyBank className="mt-0.5 size-5 shrink-0 text-app-purple" aria-hidden="true" />
        <div>
          <h2 id="savings-rate-trend-title" className="text-base font-semibold text-foreground">
            Savings Rate Trend
          </h2>
          {/*
            The series is cumulative: each point includes income and spending
            from the start of the selected range through that date.
          */}
          <p className="text-sm text-text-tertiary">
            Running % of income saved from the start of the range to date
          </p>
        </div>
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
              {...yAxisDefaults({
                currency: false,
                width: dims.breakpoint === 'mobile' ? 44 : 60,
              })}
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
    </section>
  )
}
