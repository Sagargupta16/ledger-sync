import { useNavigate } from 'react-router-dom'

import { motion } from 'framer-motion'
import { Area, AreaChart, CartesianGrid, Line, Tooltip, XAxis, YAxis } from 'recharts'

import StandardBarChart from '@/components/analytics/StandardBarChart'
import { useIsMobile } from '@/hooks/useIsMobile'
import {
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
import { formatCurrencyShort } from '@/lib/formatters'

import { STATUS_CONFIG } from '../budgetUtils'
import type { BudgetRow } from '../types'

interface BudgetChartsProps {
  chartData: Array<{ name: string; Budget: number; Spent: number; status: BudgetRow['status'] }>
  burndownData: Array<{ day: number; ideal: number; actual: number | undefined }>
  usageData: Array<{ category: string; usage: number; status: BudgetRow['status'] }>
}

export function BudgetCharts({ chartData, burndownData, usageData }: Readonly<BudgetChartsProps>) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  // On phones the y-axis category labels would eat a quarter of a 390px card,
  // so narrow the label gutter; per-row bars also read better with a touch
  // more height than the desktop 256px when there are several categories.
  const barYWidth = isMobile ? 64 : 96
  const bvaHeight = isMobile ? Math.max(220, chartData.length * 44) : 256
  const usageHeight = isMobile ? Math.max(220, usageData.length * 44) : 256

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-border p-4 sm:p-6"
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Budget vs Actual</h2>
          <p className="text-xs text-muted-foreground">
            Bar color reflects status -- tap a row to see its transactions
          </p>
        </div>
        <div style={{ height: bvaHeight }}>
          <StandardBarChart
            data={chartData}
            layout="vertical"
            yCategoryKey="name"
            yWidth={barYWidth}
            dataKey="name"
            height={bvaHeight}
            bars={[
              { key: 'Budget', label: 'Budget', color: rawColors.app.blue, fillOpacity: 0.4 },
              {
                key: 'Spent',
                label: 'Spent',
                color: rawColors.app.blue,
                getCellColor: (row) =>
                  STATUS_CONFIG[(row as { status: BudgetRow['status'] }).status].color,
              },
            ]}
            barGap={2}
            tooltipFormatter={(v) => formatCurrencyShort(v)}
            xTickFormatter={(v) => formatCurrencyShort(Number(v))}
            onBarClick={(name) => navigate(`/transactions?category=${encodeURIComponent(name)}`)}
            ariaLabel="Horizontal grouped bar chart comparing each category's budget against actual spending, spent bars colored by status"
          />
        </div>
      </motion.div>

      {(burndownData.length > 0 || usageData.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {burndownData.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass rounded-2xl border border-border p-4 sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
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
              className="glass rounded-2xl border border-border p-4 sm:p-6"
            >
              <div className="mb-4">
                <h2 className="text-lg font-semibold">Budget Utilization</h2>
                <p className="text-xs text-muted-foreground">
                  Percent of budget used per category (highest first) -- the dashed line marks 100%
                </p>
              </div>
              <div style={{ height: usageHeight }}>
                <StandardBarChart
                  data={usageData}
                  layout="vertical"
                  yCategoryKey="category"
                  yWidth={barYWidth}
                  dataKey="category"
                  height={usageHeight}
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
