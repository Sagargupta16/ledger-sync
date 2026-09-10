import { useId } from 'react'
import { motion } from 'motion/react'
import { Area, AreaChart, Brush, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import {
  ACTIVE_DOT,
  BRUSH_DEFAULTS,
  ChartContainer,
  GRID_DEFAULTS,
  chartTooltipProps,
  currencyTooltipFormatter,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import { rawColors } from '@/constants/colors'
import { tooltipLabelString } from '@/lib/chartUtils'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { useMotionStore } from '@/store/motionStore'

import { CATEGORY_COLORS, INVESTMENT_CATEGORIES } from '../investmentUtils'

interface GrowthOverTimeChartProps {
  isLoading: boolean
  filteredGrowthData: Array<Record<string, string | number>>
}

export function GrowthOverTimeChart({
  isLoading,
  filteredGrowthData,
}: Readonly<GrowthOverTimeChartProps>) {
  const gradientId = useId().replaceAll(':', '')
  const motionEnabled = useMotionStore((state) => state.mode === 'full')
  const { animate: animateSeries, isMobile } = useChartPresentation(filteredGrowthData.length * INVESTMENT_CATEGORIES.length)
  const firstPoint = filteredGrowthData[0]
  const lastPoint = filteredGrowthData.at(-1)
  const latestBalance = INVESTMENT_CATEGORIES.reduce((sum, category) => sum + Number(lastPoint?.[category] ?? 0), 0)
  const openingBalance = INVESTMENT_CATEGORIES.reduce((sum, category) => sum + Number(firstPoint?.[category] ?? 0), 0)
  const balanceChange = latestBalance - openingBalance
  const spansYears = String(firstPoint?.date).slice(0, 4) !== String(lastPoint?.date).slice(0, 4)

  return (
    <motion.section
      className="ledger-panel min-w-0 p-4 sm:p-6"
      aria-labelledby="investment-growth-title"
      initial={motionEnabled ? { opacity: 0, y: 16 } : false}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: motionEnabled ? 0.45 : 0, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mb-5">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-app-blue">
          Wealth / contribution history
        </p>
        <h2 id="investment-growth-title" className="text-lg font-semibold tracking-tight text-foreground">
          Investment Growth Over Time
        </h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          How your recorded investment balances build across asset classes.
        </p>
      </div>
      {isLoading && <ChartSkeleton />}
      {!isLoading &&
        (filteredGrowthData.length === 0 ? (
          <ChartEmptyState height={400} />
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-y border-border/70 py-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Latest invested balance</p>
                <p className="mt-1 break-words font-mono text-2xl font-semibold tracking-tight tabular-nums text-app-blue sm:text-3xl">
                  {formatCurrency(latestBalance)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Balance change in this period</p>
                <p className={`mt-1 break-words font-mono text-base font-semibold tabular-nums ${balanceChange > 0 ? 'text-app-green' : balanceChange < 0 ? 'text-app-red' : 'text-foreground'}`}>
                  {balanceChange > 0 ? '+' : ''}{formatCurrency(balanceChange)}
                </p>
              </div>
            </div>
            <ChartSeriesLegend
              items={INVESTMENT_CATEGORIES.map((category) => ({
                key: category,
                label: category,
                color: CATEGORY_COLORS[category],
                value: formatCurrency(Number(lastPoint?.[category] ?? 0)),
              }))}
              caption={`As of ${formatDate(String(lastPoint?.date ?? ''), { day: 'numeric', month: 'short', year: 'numeric' })}`}
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
                ariaLabel="Stacked area chart of investment book value over time, split by asset class. These are ledger balances, not market returns."
              >
                <AreaChart data={filteredGrowthData} stackOffset="sign" margin={{ top: 16, right: 12, bottom: 8, left: 0 }}>
                  <defs>
                    {INVESTMENT_CATEGORIES.map((category) => (
                      <linearGradient
                        key={`gradient-${category}`}
                        id={`${gradientId}-${category.replaceAll(/[\s/]/g, '-')}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0%" stopColor={CATEGORY_COLORS[category]} stopOpacity={0.5} />
                        <stop offset="100%" stopColor={CATEGORY_COLORS[category]} stopOpacity={0.12} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid {...GRID_DEFAULTS} />
                  <XAxis
                    {...xAxisDefaults(filteredGrowthData.length, { dateFormatter: true })}
                    interval="preserveStartEnd"
                    minTickGap={isMobile ? 40 : 64}
                    height={44}
                    dataKey="date"
                    {...(spansYears && {
                      tickFormatter: (value: string) => formatDate(value, { month: 'short', year: '2-digit' }),
                    })}
                  />
                  <YAxis {...yAxisDefaults({ width: isMobile ? 52 : 68 })} />
                  <Tooltip
                    {...chartTooltipProps}
                    contentStyle={{ ...chartTooltipProps.contentStyle, maxWidth: 'min(320px, calc(100vw - 144px))' }}
                    itemStyle={{ ...chartTooltipProps.itemStyle, whiteSpace: 'normal', overflowWrap: 'anywhere' }}
                    formatter={(value, name) => [currencyTooltipFormatter(value), name || '']}
                    // recharts 3.10 widened labelFormatter's label to ReactNode; at
                    // runtime it is the `date` axis tick value. formatDate returns
                    // its input unchanged for anything that is not YYYY-MM-DD.
                    labelFormatter={(label) =>
                      formatDate(tooltipLabelString(label), {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    }
                  />
                  <ReferenceLine y={0} stroke={rawColors.chart.referenceLine} />
                  {INVESTMENT_CATEGORIES.map((category, index) => (
                    <Area
                      key={category}
                      type="monotone"
                      dataKey={category}
                      stackId="1"
                      stroke={CATEGORY_COLORS[category]}
                      strokeWidth={2}
                      dot={filteredGrowthData.length === 1 ? { r: 3, fill: CATEGORY_COLORS[category] } : false}
                      activeDot={{ ...ACTIVE_DOT, fill: CATEGORY_COLORS[category] }}
                      fillOpacity={1}
                      fill={`url(#${gradientId}-${category.replaceAll(/[\s/]/g, '-')})`}
                      isAnimationActive={animateSeries}
                      animationBegin={index * 40}
                      animationDuration={680}
                      animationEasing="ease-out"
                    />
                  ))}
                  {/* Drag-to-zoom across the timeline. Default window is the most
                  recent third so the chart reads at full fidelity on first
                  paint without forcing the user to scroll. */}
                  {filteredGrowthData.length > 6 && (
                    <Brush
                      {...BRUSH_DEFAULTS}
                      dataKey="date"
                      tickFormatter={(value: string) =>
                        formatDate(value, { month: 'short', year: '2-digit' })
                      }
                      startIndex={Math.max(
                        0,
                        filteredGrowthData.length - Math.ceil(filteredGrowthData.length / 3),
                      )}
                    />
                  )}
                </AreaChart>
              </ChartContainer>
            </motion.div>
            <div className="mt-4 flex flex-wrap justify-between gap-x-6 gap-y-2 border-t border-border/70 pt-3 text-[11px] leading-5 text-muted-foreground">
              <p>Contributions and withdrawals change these balances; this is not an investment return.</p>
              {filteredGrowthData.length > 6 && <p className="font-mono text-[10px]">Drag the handles to zoom</p>}
            </div>
            {chartDataTable(
              filteredGrowthData,
              [
                { header: 'Date', rowHeader: true, value: (row) => String(row.date) },
                ...INVESTMENT_CATEGORIES.map((category) => ({
                  header: category,
                  value: (row: Record<string, string | number>) => formatCurrency(Number(row[category] ?? 0)),
                })),
              ],
              'Investment book value history by asset class.',
              (row) => String(row.date),
            )}
          </>
        ))}
    </motion.section>
  )
}
