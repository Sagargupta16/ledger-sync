import { useId } from 'react'
import { Area, AreaChart, Brush, CartesianGrid, ReferenceDot, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'

import {
  ACTIVE_DOT,
  BRUSH_DEFAULTS,
  ChartContainer,
  GRID_DEFAULTS,
  areaGradient,
  areaGradientUrl,
  chartTooltipProps,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import type { ChartRangeControl } from '@/components/ui/useChartRange'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import { rawColors } from '@/constants/colors'
import { formatChartPeriod } from '@/lib/chartDateLabels'

import { CATEGORY_CONFIG } from '../netWorthUtils'
import type { MilestoneRow, NetWorthPoint } from '../netWorthProjection'
import type { NetWorthChartRow } from './netWorthChartView'
import { NetWorthTooltip } from './NetWorthTooltip'

interface NetWorthAreaPlotProps {
  plotData: NetWorthChartRow[]
  allCategories: string[]
  animatedPointCount: number
  effectiveStacked: boolean
  hasNegativeNetWorth: boolean
  showProjectionLine: boolean
  spansYears: boolean
  anchor: NetWorthPoint | null
  anchorDateIso: string
  milestoneRows?: readonly MilestoneRow[]
  range: ChartRangeControl
}

/** The recharts area chart: total or stacked series, projection, milestones. */
export function NetWorthAreaPlot({
  plotData,
  allCategories,
  animatedPointCount,
  effectiveStacked,
  hasNegativeNetWorth,
  showProjectionLine,
  spansYears,
  anchor,
  anchorDateIso,
  milestoneRows,
  range,
}: Readonly<NetWorthAreaPlotProps>) {
  const gradientId = useId().replaceAll(':', '')
  const { animate: animateSeries, isMobile } = useChartPresentation(animatedPointCount)

  return (
    <ChartContainer
      height={360}
      mobileHeight={300}
      ariaLabel="Cumulative income less expenses over time, with optional allocated category breakdown and forward projection band"
    >
      <AreaChart data={plotData} margin={{ top: 28, right: 12, bottom: 8, left: 0 }}>
        <defs>
          {areaGradient(`${gradientId}-netWorth`, rawColors.app.blue, 0.3, 0.025)}
          {allCategories.map((cat) => {
            const config = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.other
            return (
              <linearGradient
                key={`color-${cat}`}
                id={`${gradientId}-${cat.replaceAll(/[\s/]+/g, '-')}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={config.color} stopOpacity={0.5} />
                <stop offset="100%" stopColor={config.color} stopOpacity={0.12} />
              </linearGradient>
            )
          })}
        </defs>
        <CartesianGrid {...GRID_DEFAULTS} />
        <XAxis
          {...xAxisDefaults(plotData.length, { dateFormatter: true })}
          interval="preserveStartEnd"
          minTickGap={isMobile ? 40 : 64}
          height={44}
          dataKey="date"
          allowDuplicatedCategory={false}
          {...((showProjectionLine || spansYears) && {
            tickFormatter: (value: string) => formatChartPeriod(value, true),
          })}
        />
        <YAxis {...yAxisDefaults({ width: isMobile ? 52 : 68 })} />
        <Tooltip
          {...chartTooltipProps}
          content={NetWorthTooltip}
        />
        {hasNegativeNetWorth && <ReferenceLine y={0} stroke={rawColors.chart.referenceLineStrong} />}
        {showProjectionLine && (
          <ReferenceLine
            x={anchorDateIso}
            stroke={rawColors.text.tertiary}
            strokeDasharray="4 4"
            label={{
              value: 'Projection begins',
              fill: rawColors.text.secondary,
              fontSize: 11,
              position: 'insideTopLeft',
              fontFamily: 'var(--font-mono)',
            }}
          />
        )}
        {/* Upcoming milestones as faint horizontal threshold lines.
        Capped to the next 3 above the current net worth -- rendering
        the whole DEFAULT_MILESTONES set crowded the top of the chart
        with labels (₹5Cr / ₹10Cr lines a saver won't hit for decades).
        Rows arrive sorted ascending by value, so the first 3 upcoming
        are the nearest targets. */}
        {!effectiveStacked && milestoneRows
          ?.filter((m) => m.status === 'upcoming')
          .slice(0, 3)
          .map((m) => (
            <ReferenceLine
              key={`milestone-${m.value}`}
              y={m.value}
              stroke={rawColors.text.tertiary}
              strokeDasharray="2 4"
              strokeOpacity={0.6}
              label={{
                value: m.label,
                fill: rawColors.text.tertiary,
                fontSize: 10,
                position: 'insideLeft',
              }}
            />
          ))}
        {effectiveStacked ? (
          <>
            {allCategories.map((cat) => {
              const config = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.other
              return (
                <Area
                  key={cat}
                  type="monotone"
                  dataKey={cat}
                  stackId="1"
                  stroke={config.color}
                  strokeWidth={2}
                  dot={plotData.length === 1 ? { r: 3, fill: config.color } : false}
                  activeDot={{ ...ACTIVE_DOT, fill: config.color }}
                  fillOpacity={1}
                  fill={`url(#${gradientId}-${cat.replaceAll(/[\s/]+/g, '-')})`}
                  name={config.label}
                  isAnimationActive={animateSeries}
                  animationDuration={600}
                  animationEasing="ease-out"
                />
              )
            })}
          </>
        ) : (
          <>
            <Area
              type="monotone"
              dataKey="netWorth"
              stroke={rawColors.app.blue}
              strokeWidth={2.5}
              dot={plotData.length === 1 ? { r: 3, fill: rawColors.app.blue } : false}
              activeDot={{ ...ACTIVE_DOT, r: 5, fill: rawColors.app.blue }}
              fillOpacity={1}
              fill={areaGradientUrl(`${gradientId}-netWorth`)}
              name="Net worth trend (cash flow)"
              isAnimationActive={animateSeries}
              animationDuration={750}
              animationEasing="ease-out"
            />
            {showProjectionLine && (
              <>
                {/* 1-stddev confidence band, drawn before the median line so the
                line renders on top. The band widens as sqrt(time) under the
                random-walk-with-drift model. Empty on historical points. */}
                <Area
                  type="monotone"
                  dataKey="projectionBand"
                  stroke="none"
                  fill={rawColors.app.blue}
                  fillOpacity={0.15}
                  name="Projected range (±1σ)"
                  connectNulls
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="projected"
                  stroke={rawColors.app.blue}
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  dot={false}
                  activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.blue }}
                  fill="transparent"
                  name="Projected (median)"
                  connectNulls
                  isAnimationActive={false}
                />
              </>
            )}
          </>
        )}
        {!effectiveStacked && anchor && (
          <ReferenceDot
            x={anchor.date}
            y={anchor.netWorth}
            r={4}
            fill={rawColors.app.blue}
            stroke={rawColors.chart.tooltipBg}
            strokeWidth={2}
          />
        )}
        {plotData.length > 6 && (
          <Brush
            {...BRUSH_DEFAULTS}
            dataKey="date"
            tickFormatter={(value: string) =>
              formatChartPeriod(value, true)
            }
            startIndex={range.startIndex}
            endIndex={range.endIndex}
            onChange={range.setRange}
          />
        )}
      </AreaChart>
    </ChartContainer>
  )
}
