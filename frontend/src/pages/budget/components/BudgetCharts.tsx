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
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import StandardBarChart from '@/components/analytics/StandardBarChart'
import {
  BAR_RADIUS,
  ChartContainer,
  GRID_DEFAULTS,
  areaGradient,
  areaGradientUrl,
  chartTooltipProps,
  currencyTooltipFormatter,
  shouldAnimate,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { CHART_TEXT } from '@/constants/chartColors'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { formatCurrencyShort } from '@/lib/formatters'

import { STATUS_CONFIG } from '../budgetUtils'
import type { BudgetRow } from '../types'

interface BudgetChartsProps {
  chartData: Array<{ name: string; Budget: number; Spent: number; status: BudgetRow['status'] }>
  burndownData: Array<{ day: number; ideal: number; actual: number | undefined }>
  usageData: Array<{ category: string; usage: number; status: BudgetRow['status'] }>
}

export function BudgetCharts({ chartData, burndownData, usageData }: Readonly<BudgetChartsProps>) {
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
            <ChartContainer ariaLabel="Bar chart comparing each category's budget against actual spending">
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
                <Tooltip {...chartTooltipProps} formatter={currencyTooltipFormatter} />
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
                      fill={CHART_TEXT.secondary}
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
                      fill={CHART_TEXT.secondary}
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

      {(burndownData.length > 0 || usageData.length > 0) && (
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
                      style={{ borderColor: CHART_TEXT.subtle }}
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
                <ChartContainer ariaLabel="Area chart showing remaining monthly budget day by day against the ideal spending pace">
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
                        currencyTooltipFormatter(value),
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
                      stroke={CHART_TEXT.subtle}
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

          {usageData.length >= 3 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="glass rounded-2xl border border-border p-6"
            >
              <div className="mb-4">
                <h2 className="text-lg font-semibold">Budget Utilization</h2>
                <p className="text-xs text-muted-foreground">
                  Percent of budget used per category (highest first) -- the dashed line marks 100%
                </p>
              </div>
              <div className="h-64">
                <StandardBarChart
                  data={usageData}
                  layout="vertical"
                  yCategoryKey="category"
                  yWidth={96}
                  dataKey="category"
                  height={256}
                  bars={[
                    {
                      key: 'usage',
                      color: rawColors.app.blue,
                      getCellColor: (row) =>
                        STATUS_CONFIG[(row as { status: BudgetRow['status'] }).status].color,
                    },
                  ]}
                  showLegend={false}
                  tooltipFormatter={(v) => `${v}%`}
                  xTickFormatter={(v) => `${v}%`}
                  referenceLines={[{ x: 100, label: '100%', color: CHART_TEXT.subtle }]}
                  ariaLabel="Horizontal bar chart of budget utilization percentage per category, sorted highest first, with a reference line at 100 percent"
                />
              </div>
            </motion.div>
          )}
        </div>
      )}
    </>
  )
}
