import { motion } from 'framer-motion'
import { BarChart3, Sparkles, TrendingUp } from 'lucide-react'
import { Area, AreaChart, Brush, CartesianGrid, Legend, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'

import EmptyState from '@/components/shared/EmptyState'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import {
  ACTIVE_DOT,
  BRUSH_DEFAULTS,
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
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { formatDate } from '@/lib/formatters'

import { CATEGORY_CONFIG } from '../netWorthUtils'
import type { MilestoneRow, NetWorthPoint } from '../netWorthProjection'

interface NetWorthTrendChartProps {
  isLoading: boolean
  filteredNetWorthData: Array<Record<string, number | string>>
  chartData: Array<Record<string, number | string | null>>
  allCategories: string[]
  showStacked: boolean
  setShowStacked: (v: boolean) => void
  showProjection: boolean
  setShowProjection: (v: boolean) => void
  monthlyGrowthRate: number
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
    monthlyGrowthRate,
    anchor,
    milestoneRows,
  } = props
  const dims = useChartDimensions()

  // Stacked view splits net worth into category proportions of a POSITIVE total;
  // when cumulative net worth is negative those proportions collapse to a flat
  // zero line (meaningless). Disable the stacked toggle for windows that dip
  // negative and fall back to the total view.
  const hasNegativeNetWorth = chartData.some((d) => typeof d.netWorth === 'number' && d.netWorth < 0)
  const stackedAllowed = !hasNegativeNetWorth
  const effectiveStacked = showStacked && stackedAllowed

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-app-blue" />
          <h3 className="text-lg font-semibold text-white">Net Worth Trend</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Net worth chart view options">
          <button
            onClick={() => setShowProjection(!showProjection)}
            disabled={monthlyGrowthRate <= 0}
            aria-pressed={showProjection}
            title={
              monthlyGrowthRate <= 0
                ? 'Need positive monthly growth to project'
                : `Project forward at ${(monthlyGrowthRate * 100).toFixed(2)} %/month compound (~${(((1 + monthlyGrowthRate) ** 12 - 1) * 100).toFixed(1)} % annualized)`
            }
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              showProjection
                ? 'bg-app-blue/20 text-white border border-app-blue/40'
                : 'bg-white/5 text-muted-foreground hover:bg-white/10 border border-border'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Sparkles className="w-4 h-4" aria-hidden />
            {showProjection ? 'Projecting' : 'Project'}
          </button>
          <button
            onClick={() => setShowStacked(!showStacked)}
            disabled={!stackedAllowed}
            aria-pressed={effectiveStacked}
            title={stackedAllowed ? undefined : 'Stacked view is unavailable while net worth is negative in this range'}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              effectiveStacked
                ? 'bg-primary text-white'
                : 'bg-white/5 text-muted-foreground hover:bg-white/10 border border-border'
            }`}
          >
            {effectiveStacked ? (
              <BarChart3 className="w-4 h-4" aria-hidden />
            ) : (
              <TrendingUp className="w-4 h-4" aria-hidden />
            )}
            {effectiveStacked ? 'Stacked View' : 'Total View'}
          </button>
        </div>
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
        const anchorDateIso = anchor?.date ?? new Date().toISOString().substring(0, 10)
        const showProjectionLine = showProjection && monthlyGrowthRate > 0
        return (
          <ChartContainer
            height={320}
            ariaLabel="Net worth over time, with optional category breakdown and forward projection band"
          >
            <AreaChart data={chartData}>
              <defs>
                {areaGradient('netWorth', rawColors.app.purple)}
                {areaGradient('income', rawColors.app.green, 0.6, 0.1)}
                {areaGradient('expenses', rawColors.app.red, 0.6, 0.1)}
                {allCategories.map((cat) => {
                  const config = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.other
                  return (
                    <linearGradient
                      key={`color-${cat}`}
                      id={`color-${cat.replaceAll(/\s+/g, '')}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor={config.color} stopOpacity={0.7} />
                      <stop offset="95%" stopColor={config.color} stopOpacity={0.2} />
                    </linearGradient>
                  )
                })}
              </defs>
              <CartesianGrid {...GRID_DEFAULTS} />
              <XAxis
                {...xAxisDefaults(chartData.length, {
                  angle: dims.angleXLabels ? -45 : undefined,
                  height: 80,
                  dateFormatter: true,
                })}
                dataKey="date"
              />
              <YAxis {...yAxisDefaults()} />
              <Tooltip
                {...chartTooltipProps}
                formatter={currencyTooltipFormatter}
                labelFormatter={(label) =>
                  formatDate(label, {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })
                }
              />
              {dims.showLegend && <Legend {...LEGEND_DEFAULTS} />}
              {showProjectionLine && (
                <ReferenceLine
                  x={anchorDateIso}
                  stroke={rawColors.text.tertiary}
                  strokeDasharray="4 4"
                  label={{
                    value: 'Now',
                    fill: rawColors.text.secondary,
                    fontSize: 11,
                    position: 'top',
                  }}
                />
              )}
              {/* Upcoming milestones as faint horizontal threshold lines.
                  Recharts auto-clips lines outside the y-axis range so we
                  render the whole DEFAULT_MILESTONES set without filtering. */}
              {!effectiveStacked && milestoneRows?.filter((m) => m.status === 'upcoming').map((m) => (
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
                        dot={chartData.length === 1 ? { r: 3, fill: config.color } : false}
                        activeDot={{ ...ACTIVE_DOT, fill: config.color }}
                        fillOpacity={1}
                        fill={`url(#color-${cat.replaceAll(/\s+/g, '')})`}
                        name={config.label}
                        isAnimationActive={shouldAnimate(filteredNetWorthData.length)}
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
                    stroke={rawColors.app.purple}
                    strokeWidth={2}
                    dot={chartData.length === 1 ? { r: 3, fill: rawColors.app.purple } : false}
                    activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.purple }}
                    fillOpacity={1}
                    fill={areaGradientUrl('netWorth')}
                    name="Net Worth"
                    isAnimationActive={shouldAnimate(filteredNetWorthData.length)}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                  {showProjectionLine && (
                    <>
                      {/* 1-stddev confidence band, drawn before the median line so the
                          line renders on top. The band widens as sqrt(time) under the
                          GBM model. Empty during historical points (null tuple). */}
                      <Area
                        type="monotone"
                        dataKey="projectionBand"
                        stroke="none"
                        fill={rawColors.app.blue}
                        fillOpacity={0.15}
                        name="Projection band (±1σ)"
                        connectNulls
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="projected"
                        stroke={rawColors.app.blue}
                        strokeWidth={2}
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
              {/* Drag-to-zoom on the x-axis. Default window is the most-recent
                  third of the data so the chart still reads at full fidelity
                  on first paint; users can drag either traveller to widen or
                  narrow the view without touching the global time filter. */}
              {chartData.length > 6 && (
                <Brush
                  {...BRUSH_DEFAULTS}
                  dataKey="date"
                  tickFormatter={(value: string) =>
                    formatDate(value, { month: 'short', year: '2-digit' })
                  }
                  startIndex={Math.max(0, chartData.length - Math.ceil(chartData.length / 3))}
                />
              )}
            </AreaChart>
          </ChartContainer>
        )
      })()}
    </motion.div>
  )
}
