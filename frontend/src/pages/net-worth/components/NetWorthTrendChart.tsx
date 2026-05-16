import { motion } from 'framer-motion'
import { BarChart3 } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, Legend, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'

import EmptyState from '@/components/shared/EmptyState'
import {
  ACTIVE_DOT,
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
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { formatCurrency } from '@/lib/formatters'

import { CATEGORY_CONFIG } from '../netWorthUtils'
import type { NetWorthPoint } from '../netWorthProjection'

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
  } = props
  const dims = useChartDimensions()

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
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowProjection(!showProjection)}
            disabled={monthlyGrowthRate <= 0}
            title={
              monthlyGrowthRate <= 0
                ? 'Need positive monthly growth to project'
                : `Project forward at ${(monthlyGrowthRate * 100).toFixed(2)} %/month compound (~${(((1 + monthlyGrowthRate) ** 12 - 1) * 100).toFixed(1)} % annualized)`
            }
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              showProjection
                ? 'bg-app-blue/20 text-white border border-app-blue/40'
                : 'bg-white/5 text-muted-foreground hover:bg-white/10 border border-border'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {showProjection ? '🔮 Projecting' : '🔮 Project'}
          </button>
          <button
            onClick={() => setShowStacked(!showStacked)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              showStacked
                ? 'bg-primary text-white'
                : 'bg-white/5 text-muted-foreground hover:bg-white/10 border border-border'
            }`}
          >
            {showStacked ? '📊 Stacked View' : '📈 Total View'}
          </button>
        </div>
      </div>
      {(() => {
        if (isLoading) {
          return (
            <div className="h-80 flex items-center justify-center">
              <div className="animate-pulse text-muted-foreground">Loading chart...</div>
            </div>
          )
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
        const formattedValue = (value: number | undefined) =>
          value === undefined ? '' : formatCurrency(value)
        const anchorDateIso = anchor?.date ?? new Date().toISOString().substring(0, 10)
        const showProjectionLine = showProjection && monthlyGrowthRate > 0
        return (
          <ChartContainer height={320}>
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
                formatter={formattedValue}
                labelFormatter={(label) =>
                  new Date(label).toLocaleDateString('en-US', {
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
              {showStacked ? (
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
                        dot={false}
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
                    dot={false}
                    activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.purple }}
                    fillOpacity={1}
                    fill={areaGradientUrl('netWorth')}
                    name="Net Worth"
                    isAnimationActive={shouldAnimate(filteredNetWorthData.length)}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                  {showProjectionLine && (
                    <Area
                      type="monotone"
                      dataKey="projected"
                      stroke={rawColors.app.blue}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.blue }}
                      fill="transparent"
                      name="Projected"
                      connectNulls
                      isAnimationActive={false}
                    />
                  )}
                </>
              )}
            </AreaChart>
          </ChartContainer>
        )
      })()}
    </motion.div>
  )
}
