import { motion } from 'framer-motion'
import { Area, AreaChart, CartesianGrid, Legend, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import {
  ChartContainer,
  GRID_DEFAULTS,
  LEGEND_DEFAULTS,
  areaGradient,
  areaGradientUrl,
  chartTooltipProps,
  currencyTooltipFormatter,
  shouldAnimate,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import { rawColors } from '@/constants/colors'

import type { ChartDataPoint } from '../types'

const PRESETS = [
  { label: '1Y', years: 1 },
  { label: '3Y', years: 3 },
  { label: '5Y', years: 5 },
  { label: '10Y', years: 10 },
  { label: '20Y', years: 20 },
  { label: '30Y', years: 30 },
] as const

interface GrowthChartProps {
  chartData: ChartDataPoint[]
  projectionYears: number
  onProjectionYearsChange: (years: number) => void
}

export function GrowthChart(props: Readonly<GrowthChartProps>) {
  const { chartData, projectionYears, onProjectionYearsChange } = props

  // The "Today" boundary is the last historical point; everything after it is
  // projected. Used for a reference line so past vs future reads at a glance.
  const lastHistorical = [...chartData].reverse().find((d) => d.isHistorical)
  const todayMonth = lastHistorical?.month
  const hasExpected = chartData.some((d) => d.expectedValue !== undefined)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8 }}
      className="glass rounded-2xl border border-border p-4 sm:p-6"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold">Investment Growth Path</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Blue: principal invested · Green: actual portfolio value · Orange:
            expected at your assumed return
          </p>
        </div>
        <div
          className="flex gap-2 flex-wrap"
          role="group"
          aria-label="Projection period presets"
        >
          {PRESETS.map((preset) => (
            <button
              key={preset.years}
              onClick={() => onProjectionYearsChange(preset.years)}
              aria-pressed={projectionYears === preset.years}
              className={`px-3 py-2.5 rounded-full border-2 font-semibold text-xs transition ${
                projectionYears === preset.years
                  ? 'border-primary bg-primary/20 text-primary'
                  : 'border-border bg-transparent text-muted-foreground hover:border-primary/50'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      {chartData.length === 0 ? (
        <ChartEmptyState
          height={384}
          message="No SIP transactions found. Transfer data to a mutual fund account to see projections."
        />
      ) : (
        <div className="h-72 sm:h-96">
          <ChartContainer
            height="100%"
            mobileHeight="100%"
            ariaLabel="Area chart projecting principal invested versus portfolio value over the selected number of years."
          >
            <AreaChart data={chartData}>
              <defs>
                {areaGradient('invested', rawColors.app.blue, 0.8, 0.1)}
                {areaGradient('value', rawColors.app.green, 0.8, 0.1)}
              </defs>
              <CartesianGrid {...GRID_DEFAULTS} />
              <XAxis
                {...xAxisDefaults(chartData.length)}
                dataKey="month"
                interval="preserveStartEnd"
              />
              <YAxis {...yAxisDefaults()} />
              <Tooltip {...chartTooltipProps} formatter={currencyTooltipFormatter} />
              <Legend {...LEGEND_DEFAULTS} />
              <Area
                type="monotone"
                dataKey="invested"
                name="Invested Amount"
                stroke={rawColors.app.blue}
                fill={areaGradientUrl('invested')}
                strokeWidth={2}
                dot={false}
                isAnimationActive={shouldAnimate(chartData.length)}
                animationDuration={600}
                animationEasing="ease-out"
              />
              <Area
                type="monotone"
                dataKey="value"
                name="Portfolio Value"
                stroke={rawColors.app.green}
                fill={areaGradientUrl('value')}
                strokeWidth={2}
                dot={false}
                isAnimationActive={shouldAnimate(chartData.length)}
                animationDuration={600}
                animationEasing="ease-out"
              />
              {hasExpected && (
                <Line
                  type="monotone"
                  dataKey="expectedValue"
                  name="Expected (at assumed return)"
                  stroke={rawColors.app.orange}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={shouldAnimate(chartData.length)}
                  animationDuration={600}
                  animationEasing="ease-out"
                />
              )}
              {todayMonth && (
                <ReferenceLine
                  x={todayMonth}
                  stroke="rgba(255,255,255,0.25)"
                  strokeDasharray="3 3"
                  label={{ value: 'Today', position: 'insideTopRight', fill: 'rgba(255,255,255,0.55)', fontSize: 10 }}
                />
              )}
            </AreaChart>
          </ChartContainer>
        </div>
      )}
    </motion.div>
  )
}
