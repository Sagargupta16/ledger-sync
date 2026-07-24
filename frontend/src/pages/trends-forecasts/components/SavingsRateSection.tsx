import { motion } from 'framer-motion'
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
        <span className="text-sm text-text-tertiary">(% of income saved each month)</span>
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
            <YAxis
              {...yAxisDefaults({ currency: false })}
              tickFormatter={(value: number) => `${Math.round(value)}%`}
              domain={[0, 'auto']}
            />
            <Tooltip
              {...chartTooltipProps}
              labelFormatter={(label) =>
                formatDate(String(label), {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })
              }
              formatter={(_value, _name, props) => {
                const actual =
                  (props.payload as { rawSavingsRate?: number } | undefined)?.rawSavingsRate ?? 0
                const label =
                  actual < 0 ? `${actual.toFixed(1)}% (deficit)` : `${actual.toFixed(1)}%`
                return [label, 'Cumulative Savings Rate']
              }}
            />
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
