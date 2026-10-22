import AreaSeries from '@/components/charts/AreaSeries'
import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import CartesianChart, { type SeriesSpec } from '@/components/charts/CartesianChart'
import CartesianTooltip from '@/components/charts/CartesianTooltip'
import ChartBrush from '@/components/charts/ChartBrush'
import Crosshair from '@/components/charts/Crosshair'
import Grid from '@/components/charts/Grid'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import ChartSection from '@/components/ui/ChartSection'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import ChartRangeControls from '@/components/ui/ChartRangeControls'
import { useChartRange } from '@/components/ui/useChartRange'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { usePaletteSnapshot } from '@/hooks/usePaletteSnapshot'
import { formatChartPeriod } from '@/lib/chartDateLabels'
import { formatCurrency, formatDate } from '@/lib/formatters'

import { CATEGORY_COLORS, INVESTMENT_CATEGORIES } from '../investmentUtils'

interface GrowthOverTimeChartProps {
  isLoading: boolean
  filteredGrowthData: Array<Record<string, string | number>>
}

/**
 * One diverging stack, as Recharts' stackOffset="sign" drew it: positive
 * balances build up from zero, a drawn-down (negative) class builds down.
 */
const SERIES: readonly SeriesSpec[] = INVESTMENT_CATEGORIES.map((key) => ({ key, stackId: 'balance' }))
/** The tooltip reads the stack from its top layer down. */
const TOP_DOWN = [...INVESTMENT_CATEGORIES].reverse()

const monthLabel = (key: string) => formatChartPeriod(key, true)

/** Sum of the four asset classes on one row: the stack's total. */
function rowTotal(row: Readonly<Record<string, unknown>>): number {
  return INVESTMENT_CATEGORIES.reduce((sum, category) => sum + Number(row[category] ?? 0), 0)
}

function TooltipTotal({ value }: Readonly<{ value: number }>) {
  return (
    <div className="flex items-baseline justify-between gap-x-5">
      <span>Total</span>
      <span className="font-mono font-semibold tabular-nums text-foreground">{formatCurrency(value)}</span>
    </div>
  )
}

function InvestmentBalanceSummary({
  latestBalance,
  balanceChange,
}: Readonly<{ latestBalance: number; balanceChange: number }>) {
  let changeColor = 'text-foreground'
  if (balanceChange > 0) {
    changeColor = 'text-app-green'
  } else if (balanceChange < 0) {
    changeColor = 'text-app-red'
  }

  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-y border-border/70 py-4">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Latest invested balance</p>
        <p className="mt-1 break-words font-mono text-2xl font-semibold tracking-tight tabular-nums text-app-blue sm:text-3xl">
          {formatCurrency(latestBalance)}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Balance change in this period</p>
        <p className={`mt-1 break-words font-mono text-base font-semibold tabular-nums ${changeColor}`}>
          {balanceChange > 0 ? '+' : ''}{formatCurrency(balanceChange)}
        </p>
      </div>
    </div>
  )
}

export function GrowthOverTimeChart({
  isLoading,
  filteredGrowthData,
}: Readonly<GrowthOverTimeChartProps>) {
  // Resolved hex for the SVG attributes; the snapshot repaints them on a theme toggle.
  const colors = usePaletteSnapshot(CATEGORY_COLORS)
  const range = useChartRange(filteredGrowthData.map((row) => String(row.date)))
  const firstPoint = filteredGrowthData[0]
  const lastPoint = filteredGrowthData.at(-1)
  const latestBalance = lastPoint ? rowTotal(lastPoint) : 0
  const openingBalance = firstPoint ? rowTotal(firstPoint) : 0
  const balanceChange = latestBalance - openingBalance
  const spansYears = String(firstPoint?.date).slice(0, 4) !== String(lastPoint?.date).slice(0, 4)
  const zoomable = filteredGrowthData.length > 6

  return (
    <ChartSection
      titleId="investment-growth-title"
      eyebrow="Wealth / contribution history"
      title="Investment Growth Over Time"
      description="How your recorded investment balances build across asset classes."
    >
      {isLoading && <ChartSkeleton />}
      {!isLoading &&
        (filteredGrowthData.length === 0 ? (
          <ChartEmptyState height={400} />
        ) : (
          <>
            <InvestmentBalanceSummary latestBalance={latestBalance} balanceChange={balanceChange} />
            <ChartSeriesLegend
              items={INVESTMENT_CATEGORIES.map((category) => ({
                key: category,
                label: category,
                color: colors[category],
                value: formatCurrency(Number(lastPoint?.[category] ?? 0)),
              }))}
              caption={`As of ${formatDate(String(lastPoint?.date ?? ''), { day: 'numeric', month: 'short', year: 'numeric' })}`}
            />
            {zoomable && <ChartRangeControls range={range} label="Investment growth chart range" />}
            <CartesianChart
              data={filteredGrowthData}
              categoryKey="date"
              series={SERIES}
              categoryKind="point"
              visibleRange={range}
              height={360}
              mobileHeight={300}
              ariaLabel="Stacked area chart of investment book value over time, split by asset class. These are ledger balances, not market returns."
              tooltip={(
                <CartesianTooltip
                  series={TOP_DOWN.map((category) => ({ key: category, label: category, color: colors[category] }))}
                  footer={(row) => <TooltipTotal value={rowTotal(row)} />}
                />
              )}
            >
              <Grid />
              <Crosshair />
              {/* Its zero line marks where a drawn-down class turns the stack negative. */}
              <ValueAxis zeroLine />
              <CategoryAxis interval="preserveStartEnd" tickFormatter={spansYears ? monthLabel : undefined} />
              {/* Each layer wipes in under its drawing stroke, 0.12s after the one beneath it. */}
              {INVESTMENT_CATEGORIES.map((category, index) => (
                <AreaSeries
                  key={category}
                  dataKey={category}
                  color={colors[category]}
                  strokeWidth={2}
                  fillOpacity={0.5}
                  seriesIndex={index}
                />
              ))}
            </CartesianChart>
            {zoomable && (
              <ChartBrush range={range} values={filteredGrowthData.map(rowTotal)} ariaLabel="Investment growth chart zoom" />
            )}
            <div className="mt-4 flex flex-wrap justify-between gap-x-6 gap-y-2 border-t border-border/70 pt-3 text-[11px] leading-5 text-muted-foreground">
              <p>Contributions and withdrawals change these balances; this is not an investment return.</p>
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
    </ChartSection>
  )
}
