import { useMemo } from 'react'

import { motion } from 'motion/react'
import { TrendingDown } from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { rawColors } from '@/constants/colors'
import { SEMANTIC_COLORS } from '@/constants/chartColors'
import { formatCurrencyShort } from '@/lib/formatters'
import { cumulativeShareCutoff } from '@/lib/distribution'
import {
  ChartContainer,
  GRID_DEFAULTS,
  chartTooltipProps,
  currencyTooltipFormatter,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import { ACTIVE_DOT, BAR_RADIUS } from '@/components/ui/chartDefaults'
import { chartDataTable } from '@/components/ui/chartDataTable'
import ChartTooltipContent from '@/components/ui/ChartTooltipContent'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

interface ParetoChartProps {
  /**
   * Map of label -> total spent. The component sorts internally (descending)
   * and computes the cumulative % line. Labels are categories by default; pass
   * `itemNoun` when charting anything else (merchants, accounts).
   */
  readonly categoryBreakdown: Record<string, number>
  readonly height?: number
  /** Cumulative-% threshold to draw a horizontal reference line at. */
  readonly threshold?: number
  /** Cap on number of bars shown (long tail rolled into "Other"). */
  readonly maxBars?: number
  /** Card heading. Default 'Pareto Analysis'. */
  readonly title?: string
  /** Singular noun for the charted dimension. Default 'category'. */
  readonly itemNoun?: string
  /** Plural of `itemNoun`. Default `${itemNoun}s`, overridable for irregulars. */
  readonly itemNounPlural?: string
}

/**
 * The cumulative-% series' display name.
 *
 * Recharts resolves a tooltip entry's `name` to the series' `name` prop when one
 * is set (`getTooltipNameProp` in recharts' ChartUtils), never the `dataKey`.
 * The formatter below therefore has to match on THIS string -- the previous
 * `name === 'cumulativePct'` check could never be true, so the percentage was
 * being formatted through the currency formatter.
 */
const CUMULATIVE_SERIES_NAME = 'Cumulative %'

/** Enough English for the nouns this chart labels ('category' -> 'categories'). */
function pluralize(noun: string): string {
  return noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : `${noun}s`
}

interface ParetoRow {
  category: string
  amount: number
  cumulative: number
  cumulativePct: number
  /**
   * Bar colour, carried on the datum because Recharts merges each data row over
   * the bar's rectangle props and reads `fill` from there. That is the supported
   * replacement for the `<Cell>` child, which is deprecated and removed in
   * Recharts 4.0 (see the `@deprecated` tag on `recharts/types/component/Cell`).
   */
  fill: string
}

interface ParetoModel {
  rows: ParetoRow[]
  /**
   * How many labels it takes to cross the threshold, counted over EVERY label,
   * not the capped bar list. Counting over the capped list made the headline max
   * out at `maxBars` and could count the synthetic "Other" bucket as one label,
   * which contradicted the same statistic computed elsewhere on the page.
   */
  vitalFewCount: number
}

function buildParetoSummary(
  rowCount: number,
  vitalFewCount: number,
  threshold: number,
  itemNoun: string,
  plural: string,
) {
  if (rowCount === 0) return `Which ${plural} make up ${threshold}% of your spend`
  const countedNoun = vitalFewCount === 1 ? itemNoun : plural
  const verb = vitalFewCount === 1 ? 'makes' : 'make'
  return `${vitalFewCount} ${countedNoun} ${verb} up ${threshold}% of your spend -- the rest are the long tail`
}

/**
 * Pareto chart for spending concentration.
 *
 * Sorts labels descending by spend, draws each as a bar, and overlays
 * a cumulative-percentage line on a secondary y-axis. A reference line at
 * the configured threshold (default 80 %) shows the "few that contribute
 * most" boundary -- the classic 80/20 Pareto question.
 *
 * Long tails (>maxBars labels) collapse into a single "Other" bucket
 * so the x-axis stays readable on dense data.
 *
 * The charted dimension is caller-supplied: categories on the expense page,
 * merchants on the merchant-intelligence page. Only the copy changes -- the
 * 80/20 maths is identical either way.
 */
export default function ParetoChart({
  categoryBreakdown,
  height = 320,
  threshold = 80,
  maxBars = 12,
  title = 'Pareto Analysis',
  itemNoun = 'category',
  itemNounPlural,
}: ParetoChartProps) {
  const vitalColor = SEMANTIC_COLORS.expense
  const tailColor = rawColors.text.tertiary
  const { rows: data, vitalFewCount } = useMemo<ParetoModel>(() => {
    const empty: ParetoModel = { rows: [], vitalFewCount: 0 }
    const sorted = Object.entries(categoryBreakdown)
      .map(([category, amount]) => ({ category, amount: Math.abs(amount) }))
      .sort((a, b) => b.amount - a.amount)

    const total = sorted.reduce((sum, r) => sum + r.amount, 0)
    if (sorted.length === 0 || total === 0) return empty

    // Roll the long tail into "Other" so the x-axis doesn't get crowded. The
    // total is taken BEFORE capping, so bucketing never changes the maths --
    // only how many bars are drawn.
    const hasOther = sorted.length > maxBars
    let head = sorted
    if (hasOther) {
      const visible = sorted.slice(0, maxBars - 1)
      const otherTotal = sorted
        .slice(maxBars - 1)
        .reduce((sum, r) => sum + r.amount, 0)
      head = [...visible, { category: 'Other', amount: otherTotal }]
    }

    const { count: vitalFewCount } = cumulativeShareCutoff(
      sorted.map((row) => row.amount),
      total,
      threshold,
    )

    let running = 0
    const rows = head.map((r, i) => {
      running += r.amount
      // The synthetic "Other" bucket straddles the cutoff (it merges labels from
      // both sides), so it is never claimed as vital few.
      const isOther = hasOther && i === head.length - 1
      const isVital = !isOther && i < vitalFewCount
      return {
        category: r.category,
        amount: r.amount,
        cumulative: running,
        cumulativePct: (running / total) * 100,
        fill: isVital ? vitalColor : tailColor,
      }
    })

    return { rows, vitalFewCount }
  }, [categoryBreakdown, maxBars, threshold, vitalColor, tailColor])

  const { animate, isMobile } = useChartPresentation(data.length)
  const plural = itemNounPlural ?? pluralize(itemNoun)
  const summary = buildParetoSummary(data.length, vitalFewCount, threshold, itemNoun, plural)

  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: animate ? 0.28 : 0, ease: [0.22, 1, 0.36, 1] }}
      className="ledger-panel min-w-0 p-4 sm:p-5"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            <TrendingDown className="size-4 shrink-0 text-app-red" aria-hidden="true" />
            {title}
          </h3>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">{summary}</p>
        </div>
        {data.length > 0 && (
          <div className="shrink-0 text-right">
            <p className="font-mono text-xl font-medium tabular-nums text-foreground">
              {vitalFewCount}<span className="text-sm text-muted-foreground"> / {Object.keys(categoryBreakdown).length}</span>
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{plural} at {threshold}%</p>
          </div>
        )}
      </div>
      {data.length === 0 ? (
        <ChartEmptyState height={height} message="No spending in this range. Try a wider date range or upload more statements." />
      ) : (
        <>
          <ChartSeriesLegend items={[
            { key: 'amount', label: 'Spend', color: vitalColor },
            { key: 'cumulativePct', label: CUMULATIVE_SERIES_NAME, color: rawColors.app.blue },
          ]} caption={Object.keys(categoryBreakdown).length > maxBars ? 'Ranked spend; tail grouped' : 'Largest to smallest'} />
          <ChartContainer height={height} ariaLabel={`Pareto chart of ${itemNoun} spending: bars show spend per ${itemNoun} with a cumulative percentage line and an ${threshold} percent reference line`}>
            <ComposedChart
              data={data}
              margin={{ top: 16, right: 4, bottom: 8, left: 0 }}
              barCategoryGap="24%"
            >
              <CartesianGrid {...GRID_DEFAULTS} />
              <XAxis
                dataKey="category"
                {...xAxisDefaults(data.length, { angle: -30, height: 70 })}
                interval={isMobile ? 'preserveStartEnd' : 0}
                tickFormatter={(value: string) =>
                  value.length > 14 ? `${value.slice(0, 12)}...` : value
                }
              />
              <YAxis
                yAxisId="left"
                {...yAxisDefaults({ width: isMobile ? 48 : 56 })}
                tickFormatter={formatCurrencyShort}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                {...yAxisDefaults({ currency: false, width: isMobile ? 36 : 44 })}
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                {...chartTooltipProps}
                content={<ChartTooltipContent />}
                formatter={((value: number | undefined, name: string | undefined) =>
                  name === CUMULATIVE_SERIES_NAME
                    ? `${(value ?? 0).toFixed(1)}%`
                    : currencyTooltipFormatter(value)) as never}
              />
              {/* Vital-few bars (expense red) vs trivial-many (muted). The per-bar colour
                  rides on each datum's `fill` -- see `ParetoRow.fill`. Beyond
                  replacing the deprecated `<Cell>`, this fixes a latent
                  mis-colouring: Cell children are matched positionally against the
                  RENDERED bar list, so any filtering (zero-height bars are dropped)
                  would shift every colour onto the wrong category. */}
              <Bar
                yAxisId="left"
                dataKey="amount"
                name="Spend"
                fill={vitalColor}
                radius={BAR_RADIUS}
                maxBarSize={36}
                isAnimationActive={animate}
                animationDuration={480}
                animationEasing="ease-out"
              />
              <Line
                yAxisId="right"
                type="linear"
                dataKey="cumulativePct"
                name={CUMULATIVE_SERIES_NAME}
                stroke={rawColors.app.blue}
                strokeWidth={2.25}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={{ r: 2.5, fill: rawColors.app.blue, strokeWidth: 0 }}
                activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.blue }}
                isAnimationActive={animate}
                animationBegin={animate ? 80 : 0}
                animationDuration={520}
                animationEasing="ease-out"
              />
              <ReferenceLine
                yAxisId="right"
                y={threshold}
                stroke={rawColors.text.tertiary}
                strokeDasharray="3 5"
                label={{
                  value: `${threshold}% threshold`,
                  fill: rawColors.text.secondary,
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  position: 'insideTopRight',
                  offset: 8,
                }}
              />
            </ComposedChart>
          </ChartContainer>
          {chartDataTable(
            data,
            [
              { header: itemNoun, rowHeader: true, value: (row) => row.category },
              { header: 'Spend', value: (row) => currencyTooltipFormatter(row.amount) },
              { header: 'Cumulative spend', value: (row) => currencyTooltipFormatter(row.cumulative) },
              { header: 'Cumulative share', value: (row) => `${row.cumulativePct.toFixed(1)}%` },
            ],
            `${title} data`,
            (row, index) => `${row.category}-${index}`,
          )}
        </>
      )}
    </motion.div>
  )
}
