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
  const animateSeries = shouldAnimate(chartData.length * (hasExpected ? 3 : 2))

  return (
    <section
      className="ledger-panel p-4 sm:p-5"
      aria-labelledby="investment-growth-title"
    >
      <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 id="investment-growth-title" className="text-lg font-semibold">
            Investment Growth Path
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Historical contributions and portfolio value with the selected projection scenario
          </p>
        </div>
        <fieldset className="ledger-control m-0 grid w-full grid-cols-3 gap-1 rounded-md border p-1 sm:w-auto sm:grid-cols-6">
          <legend className="sr-only">Projection period presets</legend>
          {PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.years}
              onClick={() => onProjectionYearsChange(preset.years)}
              aria-pressed={projectionYears === preset.years}
              className={`min-h-11 min-w-11 rounded px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                projectionYears === preset.years
                  ? 'bg-app-blue/15 text-app-blue'
                  : 'text-muted-foreground hover:bg-[var(--overlay-2)] hover:text-foreground'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </fieldset>
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
              <YAxis {...yAxisDefaults({ width: 48 })} />
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
                isAnimationActive={animateSeries}
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
                isAnimationActive={animateSeries}
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
                  isAnimationActive={animateSeries}
                  animationDuration={600}
                  animationEasing="ease-out"
                />
              )}
              {todayMonth && (
                <ReferenceLine
                  x={todayMonth}
                  stroke={rawColors.chart.referenceLineStrong}
                  strokeDasharray="3 3"
                  label={{ value: 'Today', position: 'insideTopRight', fill: rawColors.chart.textSubtle, fontSize: 10 }}
                />
              )}
            </AreaChart>
          </ChartContainer>
        </div>
      )}
    </section>
  )
}
