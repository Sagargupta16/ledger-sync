import { motion } from 'motion/react'
import { PiggyBank } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { CHART_LINE_CURSOR_STYLE } from '@/components/ui/ChartTooltip'
import ChartTooltipContent from '@/components/ui/ChartTooltipContent'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import {
  ACTIVE_DOT,
  areaGradient,
  areaGradientUrl,
  chartTooltipProps,
  ChartContainer,
  GRID_DEFAULTS,
  referenceLine,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { SCROLL_FADE_UP } from '@/constants/animations'
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
  const { animate } = useChartPresentation(data.length)

  return (
    <motion.section
      {...SCROLL_FADE_UP}
      className="ledger-panel min-w-0 p-4 sm:p-6"
      aria-labelledby="savings-rate-trend-title"
    >
      <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="max-w-xl">
          <div className="mb-2 flex items-center gap-2 text-app-blue">
            <PiggyBank className="size-4 shrink-0" aria-hidden="true" />
            <p className="ledger-meta">Income retained</p>
          </div>
          <h2 id="savings-rate-trend-title" className="text-xl font-semibold tracking-tight text-foreground">
            Savings Rate Trend
          </h2>
          {/*
            The series is cumulative: each point includes income and spending
            from the start of the selected range through that date.
          */}
          <p className="mt-1 text-sm text-muted-foreground">
            Running % of income saved from the start of the range to date
          </p>
        </div>
        {!isLoading && data.length > 0 && (
          <dl className="shrink-0 sm:text-right">
            <dt className="text-xs text-muted-foreground">Latest cumulative rate</dt>
            <dd className={`mt-1 font-mono text-3xl font-semibold tabular-nums ${(data.at(-1)?.savingsRate ?? 0) < 0 ? 'text-app-red' : 'text-app-blue'}`}>
              {data.at(-1)?.savingsRate.toFixed(1)}%
            </dd>
            <dd className="mt-1 text-xs text-muted-foreground">
              {formatDate(data.at(-1)?.date ?? '', { month: 'short', day: 'numeric', year: 'numeric' })}
            </dd>
          </dl>
        )}
      </div>

      {isLoading && <ChartSkeleton height="h-64" />}
      {!isLoading && data.length > 0 && (
        <>
          <ul className="mb-5 flex flex-wrap gap-x-6 gap-y-2 border-y border-border/60 py-3 text-xs text-muted-foreground" aria-label="Savings rate chart series">
            <li className="flex items-center gap-2">
              <span className="h-0.5 w-5 bg-app-blue" aria-hidden="true" />
              Cumulative savings rate
            </li>
            <li className="flex items-center gap-2">
              <span className="w-5 border-t-2 border-dashed" style={{ borderColor: rawColors.app.green }} aria-hidden="true" />
              Target: <span className="font-mono tabular-nums text-app-green">{savingsGoalPercent}%</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-px w-5 bg-muted-foreground" aria-hidden="true" />
              0% break-even
            </li>
          </ul>
          <ChartContainer
            height={300}
            mobileHeight={260}
            ariaLabel="Cumulative savings rate over time as a percentage of income, with savings-goal target line"
          >
            <AreaChart data={data} margin={{ top: 16, right: 12, bottom: 8, left: 0 }}>
              <defs>{areaGradient('savingsRate', rawColors.app.blue, 0.24, 0.01)}</defs>
              <CartesianGrid {...GRID_DEFAULTS} />
              <XAxis
                {...xAxisDefaults(data.length, {
                  dateFormatter: true,
                })}
                dataKey="date"
                interval={dims.breakpoint === 'mobile' ? 'preserveStartEnd' : xAxisDefaults(data.length).interval}
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
                  width: dims.breakpoint === 'mobile' ? 56 : 64,
                })}
                tickFormatter={(value: number) => `${Math.round(value)}%`}
                domain={['auto', 'auto']}
              />
              <Tooltip
                {...chartTooltipProps}
                content={<ChartTooltipContent />}
                cursor={CHART_LINE_CURSOR_STYLE}
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
                variant: 'goal',
              })}
              <Area
                type="monotone"
                dataKey="savingsRate"
                stroke={rawColors.app.blue}
                fill={areaGradientUrl('savingsRate')}
                strokeWidth={2.5}
                dot={data.length === 1 ? { r: 4, fill: rawColors.app.blue } : false}
                activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.blue }}
                isAnimationActive={animate}
                animationDuration={700}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ChartContainer>
          {chartDataTable(
            data,
            [
              { header: 'Date', rowHeader: true, value: (row) => formatDate(row.date, { month: 'long', day: 'numeric', year: 'numeric' }) },
              { header: 'Cumulative savings rate', value: (row) => `${row.savingsRate.toFixed(1)}%${row.savingsRate < 0 ? ' (deficit)' : ''}` },
            ],
            'Cumulative savings rate by date',
            (row) => row.date,
          )}
        </>
      )}
      {!isLoading && data.length === 0 && <ChartEmptyState height={250} />}
    </motion.section>
  )
}
