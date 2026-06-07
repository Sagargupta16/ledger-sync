import { motion } from 'framer-motion'
import { Area, AreaChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import {
  ChartContainer,
  GRID_DEFAULTS,
  LEGEND_DEFAULTS,
  areaGradient,
  areaGradientUrl,
  chartTooltipProps,
  shouldAnimate,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8 }}
      className="glass rounded-2xl border border-border p-6"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold">Investment Growth Path</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Blue: Principal Invested | Green: Portfolio Value (with gains)
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {PRESETS.map((preset) => (
            <button
              key={preset.years}
              onClick={() => onProjectionYearsChange(preset.years)}
              className={`px-3 py-1 rounded-full border-2 font-semibold text-xs transition ${
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
      <div className="h-96" style={{ height: '384px' }}>
        {chartData.length === 0 ? (
          <ChartEmptyState
            height={384}
            message="No SIP transactions found. Transfer data to a mutual fund account to see projections."
          />
        ) : (
          <ChartContainer height={384}>
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
              <Tooltip
                {...chartTooltipProps}
                formatter={(value) =>
                  typeof value === 'number' ? formatCurrency(value) : ''
                }
              />
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
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </motion.div>
  )
}
