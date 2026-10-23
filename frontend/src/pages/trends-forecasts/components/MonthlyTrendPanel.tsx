/**
 * One of the three stacked Income & Expense Trends panels: the monthly total as
 * a gradient area, its trailing average as a dashed line and the peak month as a
 * reference line; the savings panel also marks break-even. The inspected month
 * is shared by the panels, so all of them draw the crosshair and the touched one
 * shows the tooltip.
 */

import { useCallback, useMemo } from 'react'

import AreaSeries from '@/components/charts/AreaSeries'
import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import CartesianChart, { type SeriesSpec } from '@/components/charts/CartesianChart'
import CartesianTooltip, { type TooltipSeries } from '@/components/charts/CartesianTooltip'
import Crosshair from '@/components/charts/Crosshair'
import Grid from '@/components/charts/Grid'
import LineSeries from '@/components/charts/LineSeries'
import { ReferenceLine } from '@/components/charts/References'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { formatMonthKey } from '@/lib/dateUtils'
import { formatCurrency } from '@/lib/formatters'

import type { useTrendsForecasts } from '../useTrendsForecasts'

type MonthlyTrendData = ReturnType<typeof useTrendsForecasts>['monthlyTrendWithAvg']

/** The row field a panel plots, which also names the panel. */
export type TrendKey = 'income' | 'expenses' | 'savings'

export interface TrendPanelSpec {
  readonly dataKey: TrendKey
  readonly avgKey: 'incomeAvg' | 'expensesAvg' | 'savingsAvg'
  /** Panel title; the tooltip repeats it. */
  readonly label: string
  readonly color: string
  readonly peak: number
}

/** The inspected month, as a visible row index, and the panel it is inspected in. */
export interface ActiveMonth {
  readonly index: number
  readonly panel: TrendKey
}

interface MonthlyTrendPanelProps {
  readonly spec: TrendPanelSpec
  /** Position among the panels; each later panel starts drawing one series stagger later. */
  readonly order: number
  readonly data: MonthlyTrendData
  readonly visibleRange: { readonly startIndex: number; readonly endIndex: number }
  readonly rollingAvgMonths: number
  readonly averageColor: string
  readonly active: ActiveMonth | null
  readonly onActiveChange: (panel: TrendKey, index: number | null) => void
}

/** Untouched panels keep a mounted tooltip with nothing to show, so its live region already exists when focus arrives. */
const NO_TOOLTIP: readonly TooltipSeries[] = []

const averageText = (value: number | undefined) => (value === undefined ? 'Not available' : formatCurrency(value))

export default function MonthlyTrendPanel({
  spec,
  order,
  data,
  visibleRange,
  rollingAvgMonths,
  averageColor,
  active,
  onActiveChange,
}: MonthlyTrendPanelProps) {
  const { dataKey, avgKey, label, color, peak } = spec
  const isSavings = dataKey === 'savings'
  const averageLabel = `${rollingAvgMonths}-month average`
  const series = useMemo<readonly SeriesSpec[]>(() => [{ key: dataKey }, { key: avgKey }], [dataKey, avgKey])
  // In the value domain, so the peak line stays drawn when a zoom leaves the peak month out.
  const extraValues = useMemo(() => [peak], [peak])
  const tooltipSeries = useMemo<readonly TooltipSeries[]>(() => [
    { key: dataKey, label, color },
    { key: avgKey, label: averageLabel, color: averageColor },
  ], [dataKey, avgKey, label, color, averageLabel, averageColor])
  const onActiveIndexChange = useCallback(
    (index: number | null) => onActiveChange(dataKey, index),
    [onActiveChange, dataKey],
  )

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 py-6 first:border-t first:border-border last:pb-0 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-6">
      <div className="flex flex-wrap justify-between gap-3 lg:block">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            {label}
          </h3>
          <dl className="mt-3">
            <dt className="text-xs text-muted-foreground">Peak month</dt>
            <dd className="mt-1 break-words font-mono text-lg font-semibold tabular-nums" style={{ color }}>
              {formatCurrency(peak)}
            </dd>
          </dl>
        </div>
        <ul className="space-y-2 text-xs text-muted-foreground lg:mt-5" aria-label={`${label} chart series`}>
          <li className="flex items-center gap-2">
            <span className="h-0.5 w-5" style={{ backgroundColor: color }} aria-hidden="true" />{' '}
            Monthly total
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 border-t-2 border-dashed border-text-secondary" aria-hidden="true" />
            {averageLabel}
          </li>
        </ul>
      </div>
      <div className="min-w-0">
        <CartesianChart
          data={data}
          categoryKey="month"
          series={series}
          extraValues={extraValues}
          visibleRange={visibleRange}
          height={220}
          mobileHeight={230}
          ariaLabel={`Monthly ${label.toLowerCase()} with ${rollingAvgMonths}-month rolling average and peak reference line`}
          activeIndex={active?.index ?? null}
          onActiveIndexChange={onActiveIndexChange}
          tooltip={<CartesianTooltip series={active?.panel === dataKey ? tooltipSeries : NO_TOOLTIP} />}
        >
          <Grid />
          {/* Savings draws break-even as a reference line below, so its axis adds no second zero line. */}
          <ValueAxis zeroLine={!isSavings} />
          <CategoryAxis interval="preserveStartEnd" />
          <Crosshair />
          <AreaSeries dataKey={dataKey} color={color} strokeWidth={2.5} fillOpacity={0.24} seriesIndex={order} />
          <LineSeries dataKey={avgKey} color={averageColor} strokeWidth={2} dash="6 3" seriesIndex={order + 1} />
          <ReferenceLine value={peak} variant="peak" />
          {isSavings && <ReferenceLine value={0} variant="zero" />}
        </CartesianChart>
        {chartDataTable(
          data,
          [
            { header: 'Month', rowHeader: true, value: (row) => formatMonthKey(row.month, { month: 'long', year: 'numeric' }) },
            { header: label, value: (row) => formatCurrency(row[dataKey]) },
            { header: averageLabel, value: (row) => averageText(row[avgKey]) },
          ],
          `Monthly ${label.toLowerCase()} and rolling average`,
          (row) => row.month,
        )}
      </div>
    </div>
  )
}
