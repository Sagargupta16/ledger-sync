import { useId } from 'react'
import { motion } from 'motion/react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import {
  ACTIVE_DOT,
  ChartContainer,
  GRID_DEFAULTS,
  areaGradient,
  areaGradientUrl,
  chartTooltipProps,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { CHART_TOOLTIP_STYLE } from '@/components/ui/ChartTooltip'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'
import { useMotionStore } from '@/store/motionStore'

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

function GrowthTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload.length) return null
  const point = payload[0].payload as ChartDataPoint
  const rows = [
    { label: 'Invested Amount', value: point.invested, color: rawColors.chart.neutral },
    { label: point.isHistorical ? 'Portfolio Value (allocated)' : 'Projected Portfolio Value', value: point.value, color: rawColors.app.blue },
    ...(point.expectedValue === undefined ? [] : [
      { label: 'Expected (at assumed return)', value: point.expectedValue, color: rawColors.app.orange },
    ]),
  ]

  return (
    <div role="tooltip" style={{ ...CHART_TOOLTIP_STYLE, maxWidth: 'min(320px, calc(100vw - 144px))' }}>
      <p className="mb-2 border-b border-border/60 pb-2 text-xs font-medium text-foreground">{point.month}</p>
      <p className="mb-3 text-[10px] text-muted-foreground">
        {point.isHistorical ? 'Contribution history · allocated value' : 'Projection · scenario estimate'}
      </p>
      <dl className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
            <dt className="flex items-baseline gap-2 text-xs text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden="true" />
              {row.label}
            </dt>
            <dd className="font-mono text-xs font-semibold tabular-nums text-foreground">{formatCurrency(row.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

interface GrowthChartContentProps {
  chartData: ChartDataPoint[]
  projectionYears: number
  gradientId: string
  motionEnabled: boolean
  hasExpected: boolean
  animateSeries: boolean
  isMobile: boolean
}

function GrowthChartContent(props: Readonly<GrowthChartContentProps>) {
  const { chartData, projectionYears, gradientId, motionEnabled, hasExpected, animateSeries, isMobile } = props
  // The last contribution month anchors the forecast; it need not be today.
  const lastHistorical = [...chartData].reverse().find((d) => d.isHistorical)
  const todayMonth = lastHistorical?.month
  const lastPoint = chartData.at(-1)
  const firstProjection = chartData.find((point) => !point.isHistorical)
  const projectionStartsLate = firstProjection !== undefined && chartData.indexOf(firstProjection) > chartData.length / 2
  // Split only the paint at the boundary. Values come from the unchanged model.
  const plotData = chartData.map((point) => ({
    ...point,
    historicalValue: point.isHistorical ? point.value : null,
    projectedValue: !point.isHistorical || point === lastHistorical ? point.value : null,
  }))

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-y border-border/70 py-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{firstProjection ? 'Projected portfolio value' : 'Latest allocated portfolio value'}</p>
          <motion.p
            key={lastPoint?.value}
            initial={motionEnabled ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: motionEnabled ? 0.25 : 0 }}
            className="mt-1 break-words font-mono text-2xl font-semibold tracking-tight tabular-nums text-app-blue sm:text-3xl"
          >
            {formatCurrency(lastPoint?.value ?? 0)}
          </motion.p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">{lastPoint?.month}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{firstProjection ? 'Contributed principal at horizon' : 'Contributed principal'}</p>
          <p className="mt-1 break-words font-mono text-lg font-semibold tabular-nums text-foreground">{formatCurrency(lastPoint?.invested ?? 0)}</p>
          {firstProjection && <p className="mt-1 text-[11px] text-muted-foreground">{projectionYears}-year scenario</p>}
        </div>
      </div>
      <ChartSeriesLegend
        items={[
          { key: 'invested', label: 'Invested Amount', color: rawColors.chart.neutral },
          { key: 'value', label: 'Portfolio Value', color: rawColors.app.blue },
          ...(hasExpected ? [{ key: 'expectedValue', label: 'Expected (at assumed return)', color: rawColors.app.orange }] : []),
        ]}
        caption="Dashed blue = projected value"
      />
      <motion.div
        initial={motionEnabled ? { opacity: 0, y: 12 } : false}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: motionEnabled ? 0.5 : 0, ease: [0.22, 1, 0.36, 1] }}
      >
        <ChartContainer
          height={360}
          mobileHeight={300}
          ariaLabel="Area chart projecting principal invested versus portfolio value over the selected number of years."
        >
          <ComposedChart data={plotData} margin={{ top: 28, right: 16, bottom: 8, left: 0 }}>
            <defs>
              {areaGradient(`${gradientId}-invested`, rawColors.chart.neutral, 0.12, 0.015)}
              {areaGradient(`${gradientId}-value`, rawColors.app.blue, 0.26, 0.025)}
            </defs>
            <CartesianGrid {...GRID_DEFAULTS} />
            {firstProjection && lastPoint && (
              <ReferenceArea
                x1={todayMonth ?? firstProjection.month}
                x2={lastPoint.month}
                fill={rawColors.app.blue}
                fillOpacity={0.035}
                strokeOpacity={0}
              />
            )}
            <XAxis
              {...xAxisDefaults(chartData.length)}
              dataKey="month"
              interval="preserveStartEnd"
              minTickGap={isMobile ? 48 : 64}
              height={44}
            />
            <YAxis {...yAxisDefaults({ width: isMobile ? 52 : 68 })} />
            <Tooltip {...chartTooltipProps} content={GrowthTooltip} />
            <ReferenceLine y={0} stroke={rawColors.chart.referenceLine} />
            <Area
              type="monotone"
              dataKey="invested"
              name="Invested Amount"
              stroke={rawColors.chart.neutral}
              fill={areaGradientUrl(`${gradientId}-invested`)}
              strokeWidth={2}
              dot={chartData.length === 1 ? { r: 3 } : false}
              activeDot={{ ...ACTIVE_DOT, fill: rawColors.chart.neutral }}
              isAnimationActive={animateSeries}
              animationDuration={600}
              animationEasing="ease-out"
            />
            <Area
              type="monotone"
              dataKey="historicalValue"
              name="Portfolio Value"
              stroke={rawColors.app.blue}
              fill={areaGradientUrl(`${gradientId}-value`)}
              strokeWidth={2.5}
              dot={chartData.length === 1 ? { r: 4 } : false}
              activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.blue }}
              isAnimationActive={animateSeries}
              animationDuration={720}
              animationEasing="ease-out"
            />
            {firstProjection && (
              <Area
                type="monotone"
                dataKey="projectedValue"
                name="Projected Portfolio Value"
                stroke={rawColors.app.blue}
                fill={areaGradientUrl(`${gradientId}-value`)}
                strokeWidth={2.5}
                strokeDasharray="6 4"
                dot={false}
                activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.blue }}
                connectNulls={false}
                isAnimationActive={animateSeries}
                animationBegin={80}
                animationDuration={720}
                animationEasing="ease-out"
              />
            )}
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
            {todayMonth && firstProjection && (
              <ReferenceLine
                x={todayMonth}
                stroke={rawColors.chart.referenceLineStrong}
                strokeDasharray="3 3"
                label={{ value: 'Projection begins', position: projectionStartsLate ? 'insideTopRight' : 'insideTopLeft', fill: rawColors.chart.textSubtle, fontSize: 10, fontFamily: 'var(--font-mono)' }}
              />
            )}
          </ComposedChart>
        </ChartContainer>
      </motion.div>
      <p className="mt-4 border-t border-border/70 pt-3 text-[11px] leading-5 text-muted-foreground">
        Historical portfolio values are allocated across contributions. The dashed path and tinted region show estimates using your selected assumptions, not observed market values.
      </p>
      {chartDataTable(
        chartData,
        [
          { header: 'Month', rowHeader: true, value: (point) => point.month },
          { header: 'Basis', value: (point) => point.isHistorical ? 'Contribution history; allocated portfolio value' : 'Projection estimate' },
          { header: 'Invested Amount', value: (point) => formatCurrency(point.invested) },
          { header: 'Portfolio Value', value: (point) => formatCurrency(point.value) },
          ...(hasExpected ? [{ header: 'Expected (at assumed return)', value: (point: ChartDataPoint) => point.expectedValue === undefined ? 'Not applicable' : formatCurrency(point.expectedValue) }] : []),
        ],
        'Investment growth path. Future values are scenario estimates.',
        (point, index) => `${point.month}-${index}`,
      )}
    </>
  )
}

export function GrowthChart(props: Readonly<GrowthChartProps>) {
  const { chartData, projectionYears, onProjectionYearsChange } = props
  const gradientId = useId().replaceAll(':', '')
  const motionEnabled = useMotionStore((state) => state.mode === 'full')

  const hasExpected = chartData.some((d) => d.expectedValue !== undefined)
  const { animate: animateSeries, isMobile } = useChartPresentation(chartData.length * (hasExpected ? 3 : 2))
  const periodId = useId()

  return (
    <motion.section
      className="ledger-panel min-w-0 p-4 sm:p-6"
      aria-labelledby="investment-growth-title"
      initial={motionEnabled ? { opacity: 0, y: 16 } : false}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: motionEnabled ? 0.45 : 0, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-app-blue">
            Wealth / scenario planner
          </p>
          <h2 id="investment-growth-title" className="text-lg font-semibold tracking-tight">
            Investment Growth Path
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Historical contributions and portfolio value with the selected projection scenario
          </p>
        </div>
        <fieldset className="ledger-control m-0 grid w-full grid-cols-3 gap-1 rounded-md border p-1 sm:w-auto sm:grid-cols-6">
          <legend className="sr-only">Projection period presets</legend>
          {PRESETS.map((preset) => (
            <motion.button
              type="button"
              key={preset.years}
              onClick={() => onProjectionYearsChange(preset.years)}
              aria-pressed={projectionYears === preset.years}
              whileTap={motionEnabled ? { scale: 0.95 } : undefined}
              className={`relative isolate min-h-11 min-w-11 rounded px-3 font-mono text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${projectionYears === preset.years
                  ? 'text-app-blue'
                  : 'text-muted-foreground hover:bg-[var(--overlay-2)] hover:text-foreground'
                }`}
            >
              {projectionYears === preset.years && (
                <motion.span
                  layoutId={`${periodId}-period`}
                  className="absolute inset-0 -z-10 rounded bg-app-blue/15"
                  transition={{ duration: motionEnabled ? 0.22 : 0, ease: [0.22, 1, 0.36, 1] }}
                  aria-hidden="true"
                />
              )}
              {preset.label}
            </motion.button>
          ))}
        </fieldset>
      </div>
      {chartData.length === 0 ? (
        <ChartEmptyState
          height={384}
          message="No SIP transactions found. Transfer data to a mutual fund account to see projections."
        />
      ) : (
        <GrowthChartContent
          chartData={chartData}
          projectionYears={projectionYears}
          gradientId={gradientId}
          motionEnabled={motionEnabled}
          hasExpected={hasExpected}
          animateSeries={animateSeries}
          isMobile={isMobile}
        />
      )}
    </motion.section>
  )
}
