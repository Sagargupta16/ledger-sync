import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import Bars from '@/components/charts/Bars'
import CartesianChart, { type SeriesSpec } from '@/components/charts/CartesianChart'
import CartesianTooltip from '@/components/charts/CartesianTooltip'
import ChartBrush from '@/components/charts/ChartBrush'
import Grid from '@/components/charts/Grid'
import LineSeries from '@/components/charts/LineSeries'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import ChartSection from '@/components/ui/ChartSection'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import ChartRangeControls from '@/components/ui/ChartRangeControls'
import TooltipValueList from '@/components/ui/TooltipValueList'
import { useChartRange } from '@/components/ui/useChartRange'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { useIsMobile } from '@/hooks/useIsMobile'
import { usePaletteSnapshot } from '@/hooks/usePaletteSnapshot'
import { formatChartDate, formatChartPeriod } from '@/lib/chartDateLabels'
import { formatCurrency } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'

import { alignZeroAxes } from './returnsChartAxes'

interface MonthlyComboDatum {
  readonly month: string
  readonly income: number
  readonly expenses: number
  readonly net: number
  readonly cumulative: number
}

/**
 * Bars on the left axis, the running total on the right. On one shared axis a
 * growing cumulative stretched the scale until the monthly bars flattened.
 */
const SERIES: readonly SeriesSpec[] = [{ key: 'net' }, { key: 'cumulative', axis: 'right' }]
/** Room for a seven-character right label such as -₹20.0K (mono, about 0.6em a glyph). */
const MARGIN = { right: 60 }
const MOBILE_MARGIN = { right: 56 }

function getNetColor(net: number) {
  if (net < 0) return rawColors.app.red
  if (net > 0) return rawColors.app.green
  return rawColors.chart.neutral
}

function NetValue({
  value,
  className,
}: Readonly<{ value: number; className: string }>) {
  let color = 'text-foreground'
  if (value < 0) {
    color = 'text-app-red'
  } else if (value > 0) {
    color = 'text-app-green'
  }

  return (
    <p className={`${className} ${color}`}>
      {value > 0 ? '+' : ''}{formatCurrency(value)}
    </p>
  )
}

/** Heading, then income, expenses, the signed monthly net and the running total. */
function ComboTooltip({ point }: Readonly<{ point: MonthlyComboDatum }>) {
  const rows = [
    { label: 'Income', value: point.income, color: rawColors.app.green },
    { label: 'Expenses', value: point.expenses, color: rawColors.app.red },
    { label: 'Monthly net', value: point.net, color: getNetColor(point.net) },
    { label: 'Cumulative', value: point.cumulative, color: rawColors.app.blue },
  ]

  return (
    <>
      <p className="mb-3 border-b border-border/60 pb-2 text-xs font-medium text-foreground">{formatChartDate(point.month)}</p>
      <TooltipValueList rows={rows} />
    </>
  )
}

export default function ReturnsMonthlyChart({
  data,
}: Readonly<{ data: readonly MonthlyComboDatum[] }>) {
  // Resolved hex for the SVG attributes; the snapshot repaints them on a theme toggle.
  const app = usePaletteSnapshot(rawColors.app)
  const isMobile = useIsMobile()
  const range = useChartRange(data.map((row) => row.month))
  // Both axes fit the zoomed window, as the kit's own domains would.
  const visible = data.slice(range.startIndex, range.endIndex + 1)
  const [netAxis, cumulativeAxis] = alignZeroAxes(
    visible.map((row) => row.net),
    visible.map((row) => row.cumulative),
    isMobile ? 3 : 4,
  )
  const latest = data.at(-1)
  const periodNet = latest?.cumulative ?? 0

  return (
    <ChartSection
      titleId="monthly-returns-title"
      eyebrow="Wealth / realised cash"
      title="Monthly Investment P&L"
      description="Monthly profit and loss, with the running total for your selected period."
      descriptionClassName="text-pretty"
    >
      {data.length === 0 ? (
        <ChartEmptyState
          height={280}
          message="No realised investment activity in the selected period"
        />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-y border-border/70 py-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Cumulative realised P&amp;L</p>
              <NetValue
                value={periodNet}
                className="mt-1 break-words font-mono text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl"
              />
            </div>
            {latest && (
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Latest month · {formatChartPeriod(latest.month)}</p>
                <NetValue
                  value={latest.net}
                  className="mt-1 break-words font-mono text-lg font-semibold tabular-nums"
                />
              </div>
            )}
          </div>
          <ChartSeriesLegend
            items={[
              { key: 'gain', label: 'Monthly gain', color: app.green },
              { key: 'loss', label: 'Monthly loss', color: app.red },
              { key: 'cumulative', label: 'Dashed line · cumulative, right axis', color: app.blue },
            ]}
            caption={`Break-even at ${formatCurrency(0)}`}
          />
          {data.length > 6 && <ChartRangeControls range={range} label="Investment returns chart range" />}
          <CartesianChart
            data={data}
            categoryKey="month"
            series={SERIES}
            categoryKind="band"
            valueDomain={netAxis.domain}
            valueTicks={netAxis.ticks}
            value2Domain={cumulativeAxis.domain}
            value2Ticks={cumulativeAxis.ticks}
            visibleRange={range}
            margin={isMobile ? MOBILE_MARGIN : MARGIN}
            height={360}
            mobileHeight={300}
            ariaLabel="Combo chart of monthly investment net profit or loss as bars on the left axis, with the cumulative total as a dashed line on the right axis."
            tooltip={(
              <CartesianTooltip
                series={[
                  { key: 'income', label: 'Income', color: app.green },
                  { key: 'expenses', label: 'Expenses', color: app.red },
                  { key: 'net', label: 'Monthly net', color: app.green },
                  { key: 'cumulative', label: 'Cumulative', color: app.blue },
                ]}
                render={(_, index) => <ComboTooltip point={data[index]} />}
              />
            )}
          >
            <Grid />
            {/* The zero line is break-even for both axes: their zeros line up. */}
            <ValueAxis zeroLine />
            <ValueAxis axis="right" />
            <CategoryAxis interval="preserveStartEnd" />
            {/* Green for a profitable month, red for a loss, picked per row of the
            full data so a zoomed window never borrows another month's colour. */}
            <Bars dataKey="net" color={app.green} colorFor={(_, index) => getNetColor(data[index].net)} radius={3} />
            <LineSeries dataKey="cumulative" color={app.blue} strokeWidth={2.5} dash="6 3" seriesIndex={1} />
          </CartesianChart>
          {data.length > 6 && (
            <ChartBrush range={range} values={data.map((row) => row.cumulative)} ariaLabel="Investment returns chart zoom" />
          )}
          <div className="mt-4 flex flex-wrap justify-between gap-x-6 gap-y-2 border-t border-border/70 pt-3 text-[11px] leading-5 text-muted-foreground">
            <p>Income and booked gains, less realised losses and broker costs.</p>
          </div>
          {chartDataTable(
            data,
            [
              { header: 'Month', rowHeader: true, value: (row) => formatChartDate(row.month) },
              { header: 'Income', value: (row) => formatCurrency(row.income) },
              { header: 'Expenses', value: (row) => formatCurrency(row.expenses) },
              { header: 'Monthly net', value: (row) => formatCurrency(row.net) },
              { header: 'Cumulative', value: (row) => formatCurrency(row.cumulative) },
            ],
            'Monthly realised investment income, expenses, net profit or loss and cumulative total.',
            (row) => row.month,
          )}
        </>
      )}
    </ChartSection>
  )
}
