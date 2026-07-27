import { useMemo } from 'react'

import { motion } from 'motion/react'
import { TrendingDown } from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { rawColors } from '@/constants/colors'
import { formatCurrencyShort } from '@/lib/formatters'
import {
  ChartContainer,
  GRID_DEFAULTS,
  LEGEND_DEFAULTS,
  chartTooltipProps,
  currencyTooltipFormatter,
  shouldAnimate,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
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

/** Index of the first row whose cumulative share reaches `threshold`, plus one. */
function countVitalFew(
  sorted: readonly { amount: number }[],
  total: number,
  threshold: number,
): number {
  let running = 0
  for (const [index, row] of sorted.entries()) {
    running += row.amount
    if ((running / total) * 100 >= threshold) return index + 1
  }
  return sorted.length
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

    const vitalFewCount = countVitalFew(sorted, total, threshold)

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
        // Vital few (orange) vs trivial many (muted) -- the 80%-cutoff split.
        fill: isVital ? rawColors.app.orange : rawColors.text.tertiary,
      }
    })

    return { rows, vitalFewCount }
  }, [categoryBreakdown, maxBars, threshold])

  const animate = shouldAnimate(data.length)
  const plural = itemNounPlural ?? pluralize(itemNoun)
  const countedNoun = vitalFewCount === 1 ? itemNoun : plural
  const verb = vitalFewCount === 1 ? 'makes' : 'make'
  const summary =
    data.length === 0
      ? `Which ${plural} make up ${threshold}% of your spend`
      : `${vitalFewCount} ${countedNoun} ${verb} up ${threshold}% of your spend -- the rest are the long tail`

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 rounded-xl bg-app-orange/15">
          <TrendingDown className="w-5 h-5 text-app-orange" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-text-tertiary">{summary}</p>
        </div>
      </div>
      {data.length === 0 ? (
        <ChartEmptyState height={height} message="No spending in this range. Try a wider date range or upload more statements." />
      ) : (
        <ChartContainer height={height} ariaLabel={`Pareto chart of ${itemNoun} spending: bars show spend per ${itemNoun} with a cumulative percentage line and an ${threshold} percent reference line`}>
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 24, bottom: 8, left: 4 }}
          >
            <CartesianGrid {...GRID_DEFAULTS} />
            <XAxis
              dataKey="category"
              {...xAxisDefaults(data.length, { angle: -30, height: 70 })}
              interval={0}
              tickFormatter={(value: string) =>
                value.length > 14 ? `${value.slice(0, 12)}...` : value
              }
            />
            <YAxis
              yAxisId="left"
              {...yAxisDefaults()}
              tickFormatter={formatCurrencyShort}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
              stroke={rawColors.text.tertiary}
              tick={{ fill: rawColors.text.tertiary, fontSize: 11 }}
            />
            <Tooltip
              {...chartTooltipProps}
              formatter={((value: number | undefined, name: string | undefined) =>
                name === CUMULATIVE_SERIES_NAME
                  ? `${(value ?? 0).toFixed(1)}%`
                  : currencyTooltipFormatter(value)) as never}
            />
            <Legend {...LEGEND_DEFAULTS} />
            {/* Vital-few bars (orange) vs trivial-many (muted). The per-bar colour
                rides on each datum's `fill` -- see `ParetoRow.fill`. Beyond
                replacing the deprecated `<Cell>`, this fixes a latent
                mis-colouring: Cell children are matched positionally against the
                RENDERED bar list, so any filtering (zero-height bars are dropped)
                would shift every colour onto the wrong category. */}
            <Bar
              yAxisId="left"
              dataKey="amount"
              name="Spend"
              fill={rawColors.app.orange}
              radius={[4, 4, 0, 0]}
              isAnimationActive={animate}
              animationDuration={600}
              animationEasing="ease-out"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumulativePct"
              name={CUMULATIVE_SERIES_NAME}
              stroke={rawColors.app.blue}
              strokeWidth={2}
              dot={{ r: 3, fill: rawColors.app.blue }}
              activeDot={{ r: 5 }}
              isAnimationActive={animate}
              animationDuration={800}
            />
            <ReferenceLine
              yAxisId="right"
              y={threshold}
              stroke={rawColors.text.tertiary}
              strokeDasharray="4 4"
              label={{
                value: `${threshold}%`,
                fill: rawColors.text.secondary,
                fontSize: 11,
                position: 'right',
              }}
            />
          </ComposedChart>
        </ChartContainer>
      )}
    </motion.div>
  )
}
