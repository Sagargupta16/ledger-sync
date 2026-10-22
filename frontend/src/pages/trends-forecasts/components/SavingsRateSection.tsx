import { useMemo } from 'react'

import { motion } from 'motion/react'
import { PiggyBank } from 'lucide-react'

import AreaSeries from '@/components/charts/AreaSeries'
import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import CartesianChart, { type SeriesSpec } from '@/components/charts/CartesianChart'
import CartesianTooltip from '@/components/charts/CartesianTooltip'
import ChartBrush from '@/components/charts/ChartBrush'
import Crosshair from '@/components/charts/Crosshair'
import Grid from '@/components/charts/Grid'
import { ReferenceLine } from '@/components/charts/References'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import ChartRangeControls from '@/components/ui/ChartRangeControls'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { useChartRange } from '@/components/ui/useChartRange'
import { usePaletteSnapshot } from '@/hooks/usePaletteSnapshot'
import { formatDate, formatPercent } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { SCROLL_FADE_UP } from '@/constants/animations'

import type { useTrendsForecasts } from '../useTrendsForecasts'

type SavingsData = ReturnType<typeof useTrendsForecasts>['dailySavingsData']

interface SavingsRateSectionProps {
  readonly isLoading: boolean
  readonly data: SavingsData
  readonly savingsGoalPercent: number
}

const SERIES: readonly SeriesSpec[] = [{ key: 'savingsRate' }]
const LONG_DATE = { month: 'long', day: 'numeric', year: 'numeric' } as const

const percentTick = (value: number) => `${Math.round(value)}%`
/** The plotted value itself; a cumulative deficit reads as the negative rate it is. */
const rateText = (value: number) => (value < 0 ? `${formatPercent(value)} (deficit)` : formatPercent(value))
const longDate = (date: string) => formatDate(date, LONG_DATE)

export default function SavingsRateSection({
  isLoading,
  data,
  savingsGoalPercent,
}: SavingsRateSectionProps) {
  const range = useChartRange(data.map((row) => row.date))
  const { startIndex, endIndex } = range
  const visibleRange = useMemo(() => ({ startIndex, endIndex }), [startIndex, endIndex])
  /*
    Break-even and the goal stay inside the value axis, so both lines the legend
    promises are always drawn. The axis is otherwise free at both ends: a
    cumulative deficit is a real outcome (the live ledger has 6 such days), and
    a floor of 0 would flatten it onto the axis while the tooltip reads negative.
  */
  const extraValues = useMemo(() => [0, savingsGoalPercent], [savingsGoalPercent])
  const brushValues = useMemo(() => data.map((row) => row.savingsRate), [data])
  const { blue } = usePaletteSnapshot(rawColors.app)

  return (
    <motion.section
      {...SCROLL_FADE_UP}
      className="ledger-panel min-w-0 p-4 sm:p-6"
      aria-labelledby="savings-rate-trend-title"
    >
      <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="max-w-xl">
          <div className="mb-2 flex items-center gap-2 text-app-blue">
            <PiggyBank className="size-4 shrink-0" aria-hidden="true" />
            <p className="ledger-meta">Income retained</p>
          </div>
          <h2 id="savings-rate-trend-title" className="text-xl font-semibold tracking-tight text-foreground">
            Savings Rate Trend
          </h2>
          {/*
            The series is cumulative: each point includes income and spending
            from the start of the selected range through that date.
          */}
          <p className="mt-1 text-sm text-muted-foreground">
            Running % of income saved from the start of the range to date
          </p>
        </div>
        {!isLoading && data.length > 0 && (
          <dl className="shrink-0 sm:text-right">
            <dt className="text-xs text-muted-foreground">Latest cumulative rate</dt>
            <dd className={`mt-1 font-mono text-3xl font-semibold tabular-nums ${(data.at(-1)?.savingsRate ?? 0) < 0 ? 'text-app-red' : 'text-app-blue'}`}>
              {formatPercent(data.at(-1)?.savingsRate ?? 0)}
            </dd>
            <dd className="mt-1 text-xs text-muted-foreground">
              {formatDate(data.at(-1)?.date ?? '', { month: 'short', day: 'numeric', year: 'numeric' })}
            </dd>
          </dl>
        )}
      </div>

      {isLoading && <ChartSkeleton height="h-64" />}
      {!isLoading && data.length > 0 && (
        <>
          <ul className="mb-5 flex flex-wrap gap-x-6 gap-y-2 border-y border-border/60 py-3 text-xs text-muted-foreground" aria-label="Savings rate chart series">
            <li className="flex items-center gap-2">
              <span className="h-0.5 w-5 bg-app-blue" aria-hidden="true" />{' '}
              Cumulative savings rate
            </li>
            <li className="flex items-center gap-2">
              <span className="w-5 border-t-2 border-dashed border-app-green" aria-hidden="true" />{' '}
              Target: <span className="font-mono tabular-nums text-app-green">{savingsGoalPercent}%</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-px w-5 bg-muted-foreground" aria-hidden="true" />{' '}
              0% break-even
            </li>
          </ul>
          {data.length > 6 && <ChartRangeControls range={range} label="Savings rate chart range" />}
          <CartesianChart
            data={data}
            categoryKey="date"
            series={SERIES}
            extraValues={extraValues}
            visibleRange={visibleRange}
            height={300}
            mobileHeight={260}
            ariaLabel="Cumulative savings rate over time as a percentage of income, with savings-goal target line"
            tooltip={
              <CartesianTooltip
                series={[{ key: 'savingsRate', label: 'Cumulative savings rate', color: blue, format: rateText }]}
                formatLabel={longDate}
              />
            }
          >
            <Grid />
            {/* Break-even is the reference line below, so the axis adds no second zero line. */}
            <ValueAxis tickFormatter={percentTick} zeroLine={false} />
            <CategoryAxis interval="preserveStartEnd" />
            <Crosshair />
            <AreaSeries dataKey="savingsRate" color={blue} strokeWidth={2.5} fillOpacity={0.24} />
            <ReferenceLine value={0} variant="zero" />
            <ReferenceLine value={savingsGoalPercent} variant="goal" />
          </CartesianChart>
          {data.length > 6 && <ChartBrush range={range} values={brushValues} ariaLabel="Savings rate zoom" />}
          {chartDataTable(
            data,
            [
              { header: 'Date', rowHeader: true, value: (row) => longDate(row.date) },
              { header: 'Cumulative savings rate', value: (row) => `${formatPercent(row.savingsRate)}${row.savingsRate < 0 ? ' (deficit)' : ''}` },
            ],
            'Cumulative savings rate by date',
            (row) => row.date,
          )}
        </>
      )}
      {!isLoading && data.length === 0 && <ChartEmptyState height={250} />}
    </motion.section>
  )
}
