import { useNavigate } from 'react-router-dom'

import { motion } from 'framer-motion'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import {
  BAR_RADIUS,
  ChartContainer,
  GRID_DEFAULTS,
  areaGradient,
  areaGradientUrl,
  chartTooltipProps,
  shouldAnimate,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'

import { STATUS_CONFIG } from '../budgetUtils'
import type { BudgetRow } from '../types'

interface BudgetChartsProps {
  chartData: Array<{ name: string; Budget: number; Spent: number; status: BudgetRow['status'] }>
  burndownData: Array<{ day: number; ideal: number; actual: number | undefined }>
  radarData: Array<{ category: string; usage: number; fullMark: number }>
}

export function BudgetCharts({ chartData, burndownData, radarData }: Readonly<BudgetChartsProps>) {
  const dims = useChartDimensions()
  const navigate = useNavigate()

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-border p-6"
      >
        <h2 className="text-lg font-semibold mb-4">Budget vs Actual</h2>
        <div className="h-64">
          {chartData.length === 0 ? (
            <ChartEmptyState height={256} />
          ) : (
            <ChartContainer>
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid {...GRID_DEFAULTS} />
                <XAxis
                  {...xAxisDefaults(chartData.length, {
                    angle: dims.angleXLabels ? -20 : undefined,
                    height: 50,
                  })}
                  dataKey="name"
                />
                <YAxis {...yAxisDefaults()} />
                <Tooltip
                  {...chartTooltipProps}
                  formatter={(value) =>
                    typeof value === 'number' ? formatCurrency(value) : ''
                  }
                />
                <Bar
                  dataKey="Budget"
                  fill={rawColors.app.blue}
                  radius={BAR_RADIUS}
                  opacity={0.5}
                  isAnimationActive={shouldAnimate(chartData.length)}
                  animationDuration={600}
                  animationEasing="ease-out"
                >
                  {dims.showBarLabels && (
                    <LabelList
                      dataKey="Budget"
                      position="top"
                      fill="#f5f5f7"
                      fontSize={10}
                      formatter={(v: unknown) =>
                        !v || v === 0 ? '' : formatCurrencyShort(v as number)
                      }
                    />
                  )}
                </Bar>
                <Bar
                  dataKey="Spent"
                  radius={BAR_RADIUS}
                  isAnimationActive={shouldAnimate(chartData.length)}
                  animationDuration={600}
                  animationEasing="ease-out"
                  onClick={(data: { name?: string }) => {
                    if (data?.name)
                      navigate(`/transactions?category=${encodeURIComponent(data.name)}`)
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {dims.showBarLabels && (
                    <LabelList
                      dataKey="Spent"
                      position="top"
                      fill="#f5f5f7"
                      fontSize={10}
                      formatter={(v: unknown) =>
                        !v || v === 0 ? '' : formatCurrencyShort(v as number)
                      }
                    />
                  )}
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_CONFIG[entry.status].color} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </div>
      </motion.div>

      {(burndownData.length > 0 || radarData.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {burndownData.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass rounded-2xl border border-border p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Budget Burn-down</h2>
                  <p className="text-xs text-muted-foreground">
                    Remaining budget pace for{' '}
                    {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-4 h-0 border-t-2 border-dashed"
                      style={{ borderColor: '#71717a' }}
                    />{' '}
                    Ideal
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-4 h-0.5 rounded-full"
                      style={{ backgroundColor: rawColors.app.green }}
                    />{' '}
                    Actual
                  </span>
                </div>
              </div>
              <div className="h-64">
                <ChartContainer>
                  <AreaChart data={burndownData}>
                    <defs>{areaGradient('burnActual', rawColors.app.green, 0.35, 0.02)}</defs>
                    <CartesianGrid {...GRID_DEFAULTS} />
                    <XAxis
                      {...xAxisDefaults(burndownData.length)}
                      dataKey="day"
                      tickFormatter={(v: number) => `${v}`}
                    />
                    <YAxis {...yAxisDefaults()} />
                    <Tooltip
                      {...chartTooltipProps}
                      labelFormatter={(label) => `Day ${label}`}
                      formatter={(value, name) => [
                        typeof value === 'number' ? formatCurrency(value) : '',
                        name === 'ideal' ? 'Ideal Pace' : 'Actual Remaining',
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="actual"
                      stroke={rawColors.app.green}
                      fill={areaGradientUrl('burnActual')}
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={shouldAnimate(burndownData.length)}
                      animationDuration={600}
                      animationEasing="ease-out"
                    />
                    <Line
                      type="monotone"
                      dataKey="ideal"
                      stroke="#71717a"
                      strokeWidth={1.5}
                      strokeDasharray="6 4"
                      dot={false}
                      isAnimationActive={shouldAnimate(burndownData.length)}
                      animationDuration={600}
                      animationEasing="ease-out"
                    />
                  </AreaChart>
                </ChartContainer>
              </div>
            </motion.div>
          )}

          {radarData.length >= 3 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="glass rounded-2xl border border-border p-6"
            >
              <div className="mb-4">
                <h2 className="text-lg font-semibold">Category Usage Radar</h2>
                <p className="text-xs text-muted-foreground">
                  Budget utilization (%) across all categories
                </p>
              </div>
              <div className="h-64 flex items-center justify-center">
                <ChartContainer>
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                    <PolarGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                    <PolarAngleAxis
                      dataKey="category"
                      tick={{ fill: '#71717a', fontSize: 10 }}
                    />
                    <PolarRadiusAxis
                      angle={30}
                      domain={[0, Math.max(100, ...radarData.map((d) => d.usage))]}
                      tick={{ fill: '#52525b', fontSize: 9 }}
                      axisLine={false}
                    />
                    <Radar
                      dataKey="usage"
                      stroke={rawColors.app.blue}
                      fill={rawColors.app.blue}
                      fillOpacity={0.15}
                      strokeWidth={2}
                      dot={{ r: 3, fill: rawColors.app.blue }}
                      isAnimationActive={shouldAnimate(radarData.length)}
                      animationDuration={600}
                      animationEasing="ease-out"
                    />
                    <Tooltip
                      {...chartTooltipProps}
                      formatter={(v) => (typeof v === 'number' ? `${v}%` : '')}
                    />
                  </RadarChart>
                </ChartContainer>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </>
  )
}
