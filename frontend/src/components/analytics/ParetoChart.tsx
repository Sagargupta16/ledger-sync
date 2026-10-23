import { useMemo } from 'react'
import { motion } from 'motion/react'
import { TrendingDown } from 'lucide-react'

import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import Bars from '@/components/charts/Bars'
import CartesianChart, { type SeriesSpec } from '@/components/charts/CartesianChart'
import CartesianTooltip from '@/components/charts/CartesianTooltip'
import Grid from '@/components/charts/Grid'
import LineSeries from '@/components/charts/LineSeries'
import { ReferenceLine } from '@/components/charts/References'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { chartDataTable } from '@/components/ui/chartDataTable'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { useIsMobile } from '@/hooks/useIsMobile'
import { usePaletteSnapshot } from '@/hooks/usePaletteSnapshot'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { SEMANTIC_COLORS } from '@/constants/chartColors'
import { rawColors } from '@/constants/colors'
import { useMotionStore } from '@/store/motionStore'

import {
  CUMULATIVE_SERIES_NAME,
  buildParetoModel,
  buildParetoSummary,
  paretoTooltipSeries,
  pluralize,
  truncateLabel,
} from './paretoModel'

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

const SERIES: readonly SeriesSpec[] = [{ key: 'amount' }, { key: 'cumulativePct', axis: 'right' }]
const SHARE_DOMAIN = [0, 100] as const
const SHARE_TICKS = [0, 25, 50, 75, 100]
/** Room under the plot for 14-character labels angled -30 degrees. */
const MARGIN = { bottom: 72 }
const LABEL_ANGLE = -30
/**
 * Entrance order: the bars cascade up from 0s, the cumulative line starts drawing
 * 0.24s in (two 0.12s series steps) with its dots popping behind it, and the
 * threshold rule draws at the kit's 0.35s reference delay, its label fading in last.
 */
const LINE_SERIES_INDEX = 2

const shareTick = (value: number) => `${value}%`

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
  const isMobile = useIsMobile()
  const animate = useMotionStore((state) => state.mode !== 'reduced')
  // Theme-scoped copies of the in-place palettes: a theme toggle re-renders and re-colours every mark.
  const { expense: vitalColor } = usePaletteSnapshot(SEMANTIC_COLORS)
  const { tertiary: tailColor, secondary: thresholdLabelColor } = usePaletteSnapshot(rawColors.text)
  const { blue: lineColor } = usePaletteSnapshot(rawColors.app)
  const { rows, vitalFewCount } = useMemo(
    () => buildParetoModel(categoryBreakdown, { maxBars, threshold, palette: { vital: vitalColor, tail: tailColor } }),
    [categoryBreakdown, maxBars, threshold, vitalColor, tailColor],
  )
  // Rows are keyed uniquely (a real "Other" and the tail bar share a label); the axis and tooltip show the label.
  const labels = useMemo(() => new Map(rows.map((row) => [row.key, row.category])), [rows])
  const labelOf = (key: string) => labels.get(key) ?? key
  const labelCount = Object.keys(categoryBreakdown).length
  const plural = itemNounPlural ?? pluralize(itemNoun)
  const summary = buildParetoSummary(rows.length, vitalFewCount, threshold, itemNoun, plural)

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
        {rows.length > 0 && (
          <div className="shrink-0 text-right">
            <p className="font-mono text-xl font-medium tabular-nums text-foreground">
              {vitalFewCount}<span className="text-sm text-muted-foreground"> / {labelCount}</span>
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{plural} at {threshold}%</p>
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <ChartEmptyState height={height} message="No spending in this range. Try a wider date range or upload more statements." />
      ) : (
        <>
          <ChartSeriesLegend items={[
            { key: 'amount', label: 'Spend', color: vitalColor },
            { key: 'cumulativePct', label: CUMULATIVE_SERIES_NAME, color: lineColor },
          ]} caption={labelCount > maxBars ? 'Ranked spend; tail grouped' : 'Largest to smallest'} />
          <CartesianChart
            data={rows}
            categoryKey="key"
            series={SERIES}
            categoryKind="band"
            value2Domain={SHARE_DOMAIN}
            value2Ticks={SHARE_TICKS}
            margin={MARGIN}
            height={height}
            ariaLabel={`Pareto chart of ${itemNoun} spending: bars show spend per ${itemNoun} with a cumulative percentage line and an ${threshold} percent reference line`}
            tooltip={<CartesianTooltip series={paretoTooltipSeries(vitalColor, lineColor)} formatLabel={labelOf} />}
          >
            <Grid />
            <ValueAxis />
            <ValueAxis axis="right" tickFormatter={shareTick} />
            {/* Every bar is labelled on desktop; phones keep the first and the last. */}
            <CategoryAxis
              angle={LABEL_ANGLE}
              interval={isMobile ? Math.max(0, rows.length - 2) : 0}
              tickFormatter={(key) => truncateLabel(labelOf(key))}
            />
            {/* Vital few in the expense red, the long tail muted; each colour rides on its own row. */}
            <Bars dataKey="amount" color={vitalColor} colorFor={(_row, index) => rows[index].fill} />
            <LineSeries dataKey="cumulativePct" color={lineColor} curve="linear" showDots seriesIndex={LINE_SERIES_INDEX} />
            <ReferenceLine
              value={threshold}
              axis="right"
              color={tailColor}
              dash="3 5"
              label={`${threshold}% threshold`}
              labelColor={thresholdLabelColor}
            />
          </CartesianChart>
          {chartDataTable(
            rows,
            [
              { header: itemNoun, rowHeader: true, value: (row) => row.category },
              { header: 'Spend', value: (row) => formatCurrency(row.amount) },
              { header: 'Cumulative spend', value: (row) => formatCurrency(row.cumulative) },
              { header: 'Cumulative share', value: (row) => formatPercent(row.cumulativePct) },
            ],
            `${title} data`,
            (row) => row.key,
          )}
        </>
      )}
    </motion.div>
  )
}
