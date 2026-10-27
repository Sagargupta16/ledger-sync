/**
 * Projected end-of-day balances for the next 30 days: the total of every
 * spendable account, plus up to four accounts with any flagged one first. A
 * dashed rule marks the low-balance threshold and a dot the first crossing.
 * Hiding the total from the legend rescales the plot to the accounts.
 */

import { useMemo } from 'react'

import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import CartesianChart from '@/components/charts/CartesianChart'
import CartesianTooltip from '@/components/charts/CartesianTooltip'
import Crosshair from '@/components/charts/Crosshair'
import Grid from '@/components/charts/Grid'
import LineSeries from '@/components/charts/LineSeries'
import { ReferenceDot, ReferenceLine } from '@/components/charts/References'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { rawColors } from '@/constants/colors'
import { useBalanceProjection, useLowBalanceThreshold } from '@/hooks/api/useSafeToSpend'
import { usePaletteSnapshot } from '@/hooks/usePaletteSnapshot'
import { formatChartDate, formatChartPeriod } from '@/lib/chartDateLabels'
import { formatMonthKey } from '@/lib/dateUtils'
import { formatCurrencyCompact } from '@/lib/formatters'
import type { BalanceProjection } from '@/services/api/safeToSpend'

import { ProjectionAccountList, ThresholdForm } from './balanceProjectionParts'
import { useHiddenSeries } from './standardBarChartParts'

const PLOTTED_ACCOUNTS = 4

/** One projection day: `total` plus `a0`..`a3` for the plotted accounts. */
type ProjectionRow = { date: string } & Record<string, number | string>

interface BalanceProjectionChartProps {
  readonly days?: number
  /** Inside SafeToSpendCard: no panel of its own. */
  readonly embedded?: boolean
}

function assumptions(data: BalanceProjection): string {
  const months = data.assumptions.transfer_months
  const span = months.length > 0
    ? ` (median of ${formatMonthKey(months[0], { month: 'short' })} to ${formatMonthKey(months[months.length - 1])})`
    : ''
  const { daily_spend: burn, lookback_days: lookback, unassigned_flows: unassigned } = data.assumptions
  const loose = unassigned > 0 ? ` ${unassigned} commitment${unassigned === 1 ? '' : 's'} with no account move only the total.` : ''
  return `Each day adds the commitments due that day and the account's usual net transfers${span}, and takes its share of the average daily spend over the last ${lookback} days, ${formatCurrencyCompact(burn)}, big days included. Card bills are among those transfers.${loose}`
}

export default function BalanceProjectionChart({ days = 30, embedded = false }: BalanceProjectionChartProps) {
  const [threshold, setThreshold] = useLowBalanceThreshold()
  const query = useBalanceProjection(days, threshold)
  const app = usePaletteSnapshot(rawColors.app)
  const data = query.data
  const { rows, series } = useMemo(() => {
    const plotted = data?.accounts.slice(0, PLOTTED_ACCOUNTS) ?? []
    const accountColors = [app.purple, app.teal, app.orange, app.pink]
    return {
      rows: (data?.dates ?? []).map((date, i): ProjectionRow => ({
        ...Object.fromEntries(plotted.map((account, j) => [`a${j}`, account.balances[i]])),
        date,
        total: data?.total.balances[i] ?? 0,
      })),
      series: [
        { key: 'total', label: 'All spendable accounts', color: app.blue, source: data?.total },
        ...plotted.map((account, j) => ({ key: `a${j}`, label: account.name, color: accountColors[j], source: account })),
      ],
    }
  }, [data, app])
  const [hidden, toggle] = useHiddenSeries(series.map((item) => item.key), series.length > 1)
  const visible = series.filter((item) => !hidden.has(item.key))
  const breach = visible
    .flatMap((item) => [item.source?.below_zero_on, item.source?.below_threshold_on]
      .filter((on): on is string => Boolean(on))
      .map((on) => ({ on, item })))
    .reduce<{ on: string; item: (typeof series)[number] } | null>((best, hit) => (best === null || hit.on < best.on ? hit : best), null)

  const panel = embedded ? 'space-y-4' : 'ledger-panel space-y-4 p-4 sm:p-5'
  if (query.isLoading) return <ChartSkeleton height="h-72" />
  if (query.isError || !data) {
    return <ErrorState variant="compact" title="Projection unavailable" message="The balance projection could not be loaded." onRetry={() => void query.refetch()} />
  }

  return (
    <section aria-labelledby="balance-projection-title" className={panel}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 id="balance-projection-title" className="text-sm font-semibold text-foreground">Balance projection, next {data.days} days</h3>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            End-of-day balance of each cash, bank and wallet account from today.
            {data.balance_as_of && data.balance_as_of < data.as_of && ` Starts from transactions up to ${formatChartDate(data.balance_as_of)}.`}
          </p>
        </div>
        <ThresholdForm key={threshold} threshold={threshold} onChange={setThreshold} />
      </div>

      {data.accounts.length === 0 ? (
        <ChartEmptyState message="No cash, bank or wallet account to project. Classify accounts in Settings." height={220} />
      ) : (
        <>
          <ChartSeriesLegend
            items={series.map((item) => ({
              key: item.key,
              label: item.label,
              color: item.color,
              value: item.source ? formatCurrencyCompact(item.source.balances[item.source.balances.length - 1]) : undefined,
            }))}
            caption={`On ${formatChartDate(data.dates[data.dates.length - 1])}`}
            hidden={hidden}
            onToggle={toggle}
          />
          <CartesianChart
            data={rows}
            categoryKey="date"
            categoryKind="point"
            series={visible.map((item) => ({ key: item.key }))}
            extraValues={threshold > 0 ? [threshold] : undefined}
            height={300}
            mobileHeight={240}
            ariaLabel={`Projected end-of-day balances for the next ${data.days} days, in total and for ${series.length - 1} accounts`}
            tooltip={<CartesianTooltip series={visible} formatValue={formatCurrencyCompact} />}
          >
            <Grid />
            <ValueAxis />
            <CategoryAxis tickFormatter={(key) => formatChartPeriod(key)} interval="preserveStartEnd" />
            <Crosshair />
            {threshold > 0 && (
              <ReferenceLine value={threshold} variant="target" label={`Warn below ${formatCurrencyCompact(threshold)}`} />
            )}
            {visible.map((item) => (
              <LineSeries
                key={item.key}
                dataKey={item.key}
                color={item.color}
                strokeWidth={item.key === 'total' ? 2.5 : 1.75}
                seriesIndex={series.indexOf(item)}
              />
            ))}
            {breach && (
              <ReferenceDot
                category={breach.on}
                value={breach.item.source?.balances[data.dates.indexOf(breach.on)] ?? 0}
                color="var(--color-app-red)"
                label={formatChartPeriod(breach.on)}
              />
            )}
          </CartesianChart>
          {chartDataTable(
            rows,
            [
              { header: 'Date', rowHeader: true, value: (row) => formatChartDate(row.date) },
              ...series.map((item) => ({
                header: item.label,
                value: (row: ProjectionRow) => formatCurrencyCompact(Number(row[item.key] ?? 0)),
              })),
            ],
            `Projected balances for the next ${data.days} days`,
            (row) => row.date,
          )}
          <ProjectionAccountList accounts={data.accounts} threshold={threshold} />
        </>
      )}
      <p className="text-xs leading-5 text-text-tertiary">{assumptions(data)}</p>
    </section>
  )
}
