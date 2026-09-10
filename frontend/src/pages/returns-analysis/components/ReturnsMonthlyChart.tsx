import { motion } from 'motion/react'
import {
  Bar,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import {
  ACTIVE_DOT,
  BRUSH_DEFAULTS,
  ChartContainer,
  GRID_DEFAULTS,
  chartTooltipProps,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { CHART_TOOLTIP_STYLE } from '@/components/ui/ChartTooltip'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'
import { useMotionStore } from '@/store/motionStore'

export interface MonthlyComboDatum {
  readonly month: string
  readonly income: number
  readonly expenses: number
  readonly net: number
  readonly cumulative: number
}

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

function ComboTooltip({
  active,
  payload,
}: TooltipContentProps) {
  if (!active || !payload.length) return null
  const point = payload[0].payload as MonthlyComboDatum
  const rows = [
    { label: 'Income', value: point.income, color: rawColors.app.green },
    { label: 'Expenses', value: point.expenses, color: rawColors.app.red },
    { label: 'Monthly net', value: point.net, color: getNetColor(point.net) },
    { label: 'Cumulative', value: point.cumulative, color: rawColors.app.blue },
  ]

  return (
    <div role="tooltip" style={{ ...CHART_TOOLTIP_STYLE, maxWidth: 'min(320px, calc(100vw - 144px))' }}>
      <p className="mb-3 border-b border-border/60 pb-2 text-xs font-medium text-foreground">{point.month}</p>
      <dl className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
            <dt className="flex items-baseline gap-2 text-xs text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden="true" />
              {row.label}
            </dt>
            <dd className="font-mono text-xs font-semibold tabular-nums text-foreground">
              {formatCurrency(row.value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default function ReturnsMonthlyChart({
  data,
}: Readonly<{ data: readonly MonthlyComboDatum[] }>) {
  // Green for a profitable month, red for a loss. The colour rides on the data
  // row as `fill` (Recharts merges each row over its bar rectangle props). This
  // replaces the deprecated `<Cell>` child AND fixes a real mis-colouring: Cell
  // children are matched positionally against the RENDERED bar list, which is
  // the brush-sliced window, so once the user dragged the brush (or the default
  // startIndex kicked in, which it does for any series over 6 months) every bar
  // wore the colour of a different month's profit or loss.
  const { animate: animateSeries, isMobile } = useChartPresentation(data.length * 2)
  const motionEnabled = useMotionStore((state) => state.mode === 'full')
  const bars = data.map((datum) => ({
    ...datum,
    fill: getNetColor(datum.net),
    radius: datum.net < 0 ? [0, 0, 3, 3] : [3, 3, 0, 0],
  }))
  const latest = data.at(-1)
  const periodNet = latest?.cumulative ?? 0

  return (
    <motion.section
      className="ledger-panel min-w-0 p-4 sm:p-6"
      aria-labelledby="monthly-returns-title"
      initial={motionEnabled ? { opacity: 0, y: 16 } : false}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: motionEnabled ? 0.45 : 0, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mb-5">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-app-blue">
            Wealth / realised cash
          </p>
          <h2 id="monthly-returns-title" className="text-lg font-semibold tracking-tight text-foreground">
            Monthly Investment P&amp;L
          </h2>
          <p className="mt-1 text-pretty text-xs leading-5 text-muted-foreground">
            Monthly profit and loss, with the running total for your selected period.
          </p>
        </div>
      </div>

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
                <p className="text-xs text-muted-foreground">Latest month · {latest.month}</p>
                <NetValue
                  value={latest.net}
                  className="mt-1 break-words font-mono text-lg font-semibold tabular-nums"
                />
              </div>
            )}
          </div>
            <ChartSeriesLegend
            items={[
              { key: 'gain', label: 'Monthly gain', color: rawColors.app.green },
              { key: 'loss', label: 'Monthly loss', color: rawColors.app.red },
              { key: 'cumulative', label: 'Dashed line · cumulative', color: rawColors.app.blue },
            ]}
            caption={`Break-even at ${formatCurrency(0)}`}
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
              ariaLabel="Combo chart of monthly investment net profit or loss with a cumulative growth line."
            >
              <ComposedChart data={bars} margin={{ top: 20, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid {...GRID_DEFAULTS} />
                <XAxis {...xAxisDefaults(data.length)} dataKey="month" minTickGap={isMobile ? 36 : 56} interval="preserveStartEnd" height={44} />
                <YAxis {...yAxisDefaults({ width: isMobile ? 52 : 68 })} />
                <Tooltip {...chartTooltipProps} content={ComboTooltip} />
                <ReferenceLine
                  y={0}
                  stroke={rawColors.chart.referenceLineStrong}
                />
                <Bar
                  dataKey="net"
                  name="Monthly net"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={36}
                  isAnimationActive={animateSeries}
                  animationDuration={600}
                  animationEasing="ease-out"
                />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  name="Cumulative"
                  stroke={rawColors.app.blue}
                  strokeWidth={2.5}
                  strokeDasharray="6 3"
                  dot={data.length === 1 ? { r: 3, fill: rawColors.app.blue } : false}
                  activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.blue }}
                  isAnimationActive={animateSeries}
                  animationDuration={600}
                  animationBegin={80}
                  animationEasing="ease-out"
                />
                {data.length > 6 && (
                  <Brush
                    {...BRUSH_DEFAULTS}
                    dataKey="month"
                    startIndex={Math.max(0, data.length - Math.ceil(data.length / 3))}
                  />
                )}
              </ComposedChart>
            </ChartContainer>
          </motion.div>
          <div className="mt-4 flex flex-wrap justify-between gap-x-6 gap-y-2 border-t border-border/70 pt-3 text-[11px] leading-5 text-muted-foreground">
            <p>Income and booked gains, less realised losses and broker costs.</p>
            {data.length > 6 && <p className="font-mono text-[10px]">Drag the handles to zoom</p>}
          </div>
          {chartDataTable(
            data,
            [
              { header: 'Month', rowHeader: true, value: (row) => row.month },
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
    </motion.section>
  )
}
