import { useId } from 'react'
import { BarChart3, Sparkles, TrendingUp } from 'lucide-react'
import { motion } from 'motion/react'
import { Area, AreaChart, Brush, CartesianGrid, ReferenceDot, ReferenceLine, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'

import EmptyState from '@/components/shared/EmptyState'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
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
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { CHART_TOOLTIP_STYLE } from '@/components/ui/ChartTooltip'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import { rawColors } from '@/constants/colors'
import { tooltipLabelString } from '@/lib/chartUtils'
import { getTodayKey } from '@/lib/dateUtils'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { useMotionStore } from '@/store/motionStore'

import { CATEGORY_CONFIG } from '../netWorthUtils'
import type { MilestoneRow, NetWorthPoint } from '../netWorthProjection'

type NetWorthChartRow = Record<string, number | string | [number, number] | null>

interface NetWorthTrendChartProps {
  isLoading: boolean
  filteredNetWorthData: Array<Record<string, number | string>>
  chartData: NetWorthChartRow[]
  allCategories: string[]
  showStacked: boolean
  setShowStacked: (v: boolean) => void
  showProjection: boolean
  setShowProjection: (v: boolean) => void
  /** Average monthly net-worth change in rupees (linear model over cash flows). */
  monthlyGrowth: number
  anchor: NetWorthPoint | null
  /**
   * Upcoming milestones to draw as horizontal threshold lines so users see
   * "I'll cross 1Cr around month X". Only ``status === 'upcoming'`` rows
   * are rendered; achieved milestones are already visible as the line
   * crossing them. Recharts auto-clips lines outside the y-axis range,
   * so we render all milestones blindly and let the chart filter visually.
   */
  milestoneRows?: readonly MilestoneRow[]
}

function NetWorthTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload.length) return null

  return (
    <div role="tooltip" style={{ ...CHART_TOOLTIP_STYLE, maxWidth: 'min(320px, calc(100vw - 144px))' }}>
      <p className="mb-3 border-b border-border/60 pb-2 text-xs font-medium text-foreground">
        {formatDate(tooltipLabelString(label), { month: 'long', day: 'numeric', year: 'numeric' })}
      </p>
      <dl className="space-y-2.5">
        {payload.filter((item) => item.value != null).map((item) => (
          <div key={String(item.dataKey)} className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
            <dt className="flex items-baseline gap-2 text-xs text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
              {item.name}
            </dt>
            <dd className="flex flex-wrap gap-x-1 font-mono text-xs font-semibold tabular-nums text-foreground">
              {Array.isArray(item.value)
                ? <><span>{formatCurrency(Number(item.value[0]))}</span><span>to</span><span>{formatCurrency(Number(item.value[1]))}</span></>
                : formatCurrency(Number(item.value))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function NetWorthTrendChart(props: Readonly<NetWorthTrendChartProps>) {
  const {
    isLoading,
    filteredNetWorthData,
    chartData,
    allCategories,
    showStacked,
    setShowStacked,
    showProjection,
    setShowProjection,
    monthlyGrowth,
    anchor,
    milestoneRows,
  } = props
  const gradientId = useId().replaceAll(':', '')
  const motionEnabled = useMotionStore((state) => state.mode === 'full')

  // Stacked view splits net worth into category proportions of a POSITIVE total;
  // when cumulative net worth is negative those proportions collapse to a flat
  // zero line (meaningless). Disable the stacked toggle for windows that dip
  // negative and fall back to the total view.
  const hasNegativeNetWorth = chartData.some((d) => typeof d.netWorth === 'number' && d.netWorth < 0)
  const stackedAllowed = !hasNegativeNetWorth
  const effectiveStacked = showStacked && stackedAllowed
  // Projection rows contain totals only. A category view must use the original
  // historical rows, otherwise enabling both controls erases every category.
  const plotData = effectiveStacked && showProjection ? filteredNetWorthData : chartData
  const animatedPointCount =
    plotData.length * (effectiveStacked ? Math.max(allCategories.length, 1) : 1)
  const { animate: animateSeries, isMobile } = useChartPresentation(animatedPointCount)
  const firstPoint = filteredNetWorthData[0]
  const lastPoint = filteredNetWorthData.at(-1)
  const latestValue = typeof lastPoint?.netWorth === 'number' ? lastPoint.netWorth : 0
  const openingValue = typeof firstPoint?.netWorth === 'number' ? firstPoint.netWorth : 0
  const periodChange = latestValue - openingValue
  const showProjectionLine = showProjection && monthlyGrowth > 0 && !effectiveStacked
  const nextMilestone = milestoneRows?.find((row) => row.status === 'upcoming')
  const lastProjection = showProjectionLine ? chartData.at(-1) : undefined
  const spansYears = String(firstPoint?.date).slice(0, 4) !== String(lastPoint?.date).slice(0, 4)

  return (
    <motion.section
      initial={motionEnabled ? { opacity: 0, y: 16 } : false}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: motionEnabled ? 0.45 : 0, ease: [0.22, 1, 0.36, 1] }}
      className="ledger-panel min-w-0 p-4 sm:p-6"
      aria-labelledby="net-worth-trend-title"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-app-blue">
            Wealth / transaction trend
          </p>
          <h2 id="net-worth-trend-title" className="text-lg font-semibold tracking-tight text-foreground">
            Net Worth Trend
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Cumulative income less expenses through each date.
          </p>
        </div>
        <fieldset className="m-0 grid w-full grid-cols-2 gap-2 border-0 p-0 sm:flex sm:w-auto">
          <legend className="sr-only">Net worth chart view options</legend>
          <motion.button
            type="button"
            whileTap={motionEnabled ? { scale: 0.97 } : undefined}
            onClick={() => {
              setShowProjection(!showProjection)
              if (!showProjection) setShowStacked(false)
            }}
            disabled={monthlyGrowth <= 0}
            aria-pressed={showProjection}
            title={
              monthlyGrowth <= 0
                ? 'Need positive monthly growth to project'
                : `Project forward at your average monthly saving (cash-flow trend; market gains not tracked)`
            }
            className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-blue/50 ${showProjection
                ? 'border-app-blue/40 bg-app-blue/15 text-foreground'
                : 'border-border bg-[var(--overlay-2)] text-muted-foreground hover:bg-[var(--overlay-5)]'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Sparkles className="w-4 h-4" aria-hidden />
            {showProjection ? 'Projecting' : 'Project'}
          </motion.button>
          <motion.button
            type="button"
            whileTap={motionEnabled ? { scale: 0.97 } : undefined}
            onClick={() => {
              setShowStacked(!effectiveStacked)
              if (!effectiveStacked) setShowProjection(false)
            }}
            disabled={!stackedAllowed}
            aria-pressed={effectiveStacked}
            title={stackedAllowed ? undefined : 'Stacked view is unavailable while net worth is negative in this range'}
            className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-blue/50 disabled:cursor-not-allowed disabled:opacity-40 ${effectiveStacked
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-[var(--overlay-2)] text-muted-foreground hover:bg-[var(--overlay-5)]'
              }`}
          >
            {effectiveStacked ? (
              <BarChart3 className="w-4 h-4" aria-hidden />
            ) : (
              <TrendingUp className="w-4 h-4" aria-hidden />
            )}
            {effectiveStacked ? 'Stacked View' : 'Total View'}
          </motion.button>
        </fieldset>
      </div>
      {(() => {
        if (isLoading) {
          return <ChartSkeleton />
        }
        if (filteredNetWorthData.length === 0) {
          return (
            <EmptyState
              icon={BarChart3}
              title="No data available"
              description="Upload your transaction data to track net worth over time."
              actionLabel="Upload Data"
              actionHref="/upload"
              variant="chart"
            />
          )
        }
        // The fallback is currently unreachable -- `anchor` is null only when
        // `filteredNetWorthData` is empty, which returned above, and the marker
        // also needs `monthlyGrowth > 0` (three points minimum). It stays for the
        // type, but as a LOCAL key: the x-axis is keyed on each point's local
        // `YYYY-MM-DD`, and `toISOString()` converts to UTC first, so the moment
        // this branch ever became live it would put the marker a day left of
        // today for every user east of UTC between midnight and their offset.
        const anchorDateIso = anchor?.date ?? getTodayKey()
        return (
          <>
            <dl className="mb-5 grid grid-cols-1 gap-4 border-y border-border/70 py-4 min-[420px]:grid-cols-2 sm:grid-cols-3">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Cumulative net cash flow</dt>
                <dd className="mt-1 break-words font-mono text-2xl font-semibold tracking-tight text-app-blue tabular-nums sm:text-3xl">
                  {formatCurrency(latestValue)}
                </dd>
                <dd className="mt-1 font-mono text-[10px] text-muted-foreground">
                  Selected range endpoint · {formatDate(String(lastPoint?.date ?? ''), { day: 'numeric', month: 'short', year: 'numeric' })}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Trend change in selected period</dt>
                <dd className={`mt-1 break-words font-mono text-lg font-semibold tabular-nums ${periodChange < 0 ? 'text-app-red' : periodChange > 0 ? 'text-app-green' : 'text-foreground'}`}>
                  {periodChange > 0 ? '+' : ''}{formatCurrency(periodChange)}
                </dd>
                <dd className="mt-1 text-[11px] text-muted-foreground">From {formatCurrency(openingValue)}</dd>
              </div>
              {nextMilestone && (
                <div className="min-w-0 min-[420px]:col-span-2 sm:col-span-1">
                  <dt className="text-xs text-muted-foreground">Next trend milestone</dt>
                  <dd className="mt-1 break-words font-mono text-lg font-semibold tabular-nums text-foreground">
                    {formatCurrency(nextMilestone.value)}
                  </dd>
                  <dd className="mt-1 text-[11px] text-muted-foreground">
                    {nextMilestone.date
                      ? `Estimated ${formatDate(nextMilestone.date, { month: 'short', year: 'numeric' })}`
                      : 'No estimated date yet'}
                  </dd>
                </div>
              )}
            </dl>
            <ChartSeriesLegend
              items={effectiveStacked
                ? allCategories.map((category) => ({
                  key: category,
                  label: (CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.other).label,
                  color: (CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.other).color,
                  value: formatCurrency(Number(lastPoint?.[category] ?? 0)),
                }))
                : [
                  { key: 'netWorth', label: 'Net worth trend · cumulative cash flow', color: rawColors.app.blue },
                  ...(showProjectionLine ? [
                    { key: 'projected', label: 'Dashed · projected median', color: rawColors.app.blue },
                    { key: 'projectionBand', label: 'Shaded · projection band (±1σ)', color: rawColors.app.blue },
                  ] : []),
                ]}
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
                      tickFormatter: (value: string) => formatDate(value, { month: 'short', year: '2-digit' }),
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
                  {/* Drag-to-zoom on the x-axis. Default window: most-recent third
                  of the HISTORY. When projecting, chartData appends 60 months
                  of forecast -- a blind "last third" window would show ONLY
                  the flat dashed projection with zero historical context, so
                  anchor the window to start ~12 months before "now" instead. */}
                  {plotData.length > 6 && (
                    <Brush
                      {...BRUSH_DEFAULTS}
                      dataKey="date"
                      tickFormatter={(value: string) =>
                        formatDate(value, { month: 'short', year: '2-digit' })
                      }
                      startIndex={(() => {
                        if (!showProjectionLine) {
                          return Math.max(0, plotData.length - Math.ceil(plotData.length / 3))
                        }
                        // Last historical point = last row with a non-null netWorth.
                        let anchorIdx = chartData.length - 1
                        for (let i = chartData.length - 1; i >= 0; i--) {
                          if (chartData[i].netWorth != null) {
                            anchorIdx = i
                            break
                          }
                        }
                        return Math.max(0, anchorIdx - 12)
                      })()}
                    />
                  )}
                </AreaChart>
              </ChartContainer>
            </motion.div>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-t border-border/70 pt-3 text-[11px] leading-5 text-muted-foreground">
              <p className="max-w-prose">
                  {showProjectionLine
                    ? `Estimates extend this cash-flow trend by ${formatCurrency(monthlyGrowth)}/month in average savings. The shaded range is ±1σ; market returns are not included.`
                    : 'The trend starts at zero and accumulates recorded income less expenses. Account balance totals above can differ.'}
                  {effectiveStacked && ' Category bands use current account proportions.'}
              </p>
              {plotData.length > 6 && <p className="font-mono text-[10px]">Drag the handles to zoom</p>}
            </div>
            {lastProjection && typeof lastProjection.projected === 'number' && (
              <motion.p
                key={String(lastProjection.date)}
                initial={motionEnabled ? { opacity: 0, y: 6 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: motionEnabled ? 0.25 : 0 }}
                className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground"
              >
                Estimated {formatDate(String(lastProjection.date), { month: 'short', year: 'numeric' })}
                <span className="font-mono text-sm font-semibold tabular-nums text-app-blue">
                  {formatCurrency(lastProjection.projected)}
                </span>
              </motion.p>
            )}
            {chartDataTable<NetWorthChartRow>(
              plotData,
              [
                { header: 'Date', rowHeader: true, value: (row) => String(row.date ?? '') },
                { header: 'Cumulative net cash flow', value: (row) => typeof row.netWorth === 'number' ? formatCurrency(row.netWorth) : 'Not applicable' },
                ...allCategories.map((category) => ({
                  header: (CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.other).label,
                  value: (row: NetWorthChartRow) => typeof row[category] === 'number' ? formatCurrency(row[category]) : 'Not available',
                })),
                ...(showProjectionLine ? [
                  { header: 'Projected median (estimate)', value: (row: NetWorthChartRow) => typeof row.projected === 'number' ? formatCurrency(row.projected) : 'Not applicable' },
                  { header: 'Projected range (±1σ)', value: (row: NetWorthChartRow) => Array.isArray(row.projectionBand) ? row.projectionBand.map(formatCurrency).join(' to ') : 'Not applicable' },
                ] : []),
              ],
              'Net worth transaction trend: cumulative income less expenses. Future values are estimates.',
              (row, index) => `${String(row.date)}-${index}`,
            )}
          </>
        )
      })()}
    </motion.section>
  )
}
