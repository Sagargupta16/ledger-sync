/**
 * Comparison-page slope chart of the biggest expense categories: one line per category from period A on the left
 * to period B on the right, red where spending rose and green where it fell, with each category's move in rank.
 * A visually hidden table beside the chart carries every number.
 */

import { useMemo } from 'react'
import { motion } from 'motion/react'

import SlopeChart from '@/components/charts/SlopeChart'
import { rankWords, slopeItems, type SlopeDatum } from '@/components/charts/slopeLayout'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { SCROLL_FADE_UP } from '@/constants/animations'
import { formatCurrency } from '@/lib/formatters'

import type { CategoryDelta, PeriodSummary } from '../types'

/** The slope chart reads best with ten lines or fewer. */
const LIMIT = 10

interface CategorySlopeChartProps {
  /** Expense category deltas for the selected pair, as useComparisonData builds them. */
  readonly deltas: readonly CategoryDelta[]
  readonly periodA: PeriodSummary
  readonly periodB: PeriodSummary
}

/** The categories with the most spend across both periods together, largest first. */
function topCategories(deltas: readonly CategoryDelta[]): SlopeDatum[] {
  return [...deltas]
    .sort((x, y) => y.periodA + y.periodB - (x.periodA + x.periodB))
    .slice(0, LIMIT)
    .map((delta) => ({ key: delta.category, label: delta.category, start: delta.periodA, end: delta.periodB }))
}

export function CategorySlopeChart({ deltas, periodA, periodB }: CategorySlopeChartProps) {
  const data = useMemo(() => topCategories(deltas), [deltas])
  // The table reads the chart's own items, so its order, changes and ranks match the lines.
  const rows = useMemo(() => slopeItems(data, 'spending', formatCurrency), [data])
  if (data.length === 0) return null

  return (
    <motion.div {...SCROLL_FADE_UP} className="ledger-panel min-w-0 p-4 sm:p-6">
      <p className="ledger-meta mb-2 text-app-blue">Who moved up the ranking</p>
      <h2 className="text-xl font-semibold tracking-tight">Category Ranks</h2>
      <p className="mb-5 mt-1 text-sm leading-relaxed text-muted-foreground">
        The {data.length} biggest expense categories across both periods, {periodA.label} on the left and {periodB.label} on
        the right. Red lines spent more, green lines less; the number after each {periodB.label} amount is its move in rank.
        Hover or tap a line for its details.
      </p>
      <SlopeChart
        data={data}
        startLabel={periodA.label}
        endLabel={periodB.label}
        direction="spending"
        formatValue={formatCurrency}
        ariaLabel={`Slope chart of the top ${data.length} expense categories by combined spend, ${periodA.label} on the left and ${periodB.label} on the right, with each category's move in rank`}
      />
      {chartDataTable(
        rows,
        [
          { header: 'Category', rowHeader: true, value: (row) => row.label },
          { header: `A: ${periodA.label}`, value: (row) => row.startText },
          { header: `B: ${periodB.label}`, value: (row) => row.endText },
          { header: 'Change', value: (row) => row.change },
          { header: 'Rank, A to B', value: (row) => rankWords(row.rank) },
        ],
        `Top ${data.length} expense categories by combined spend, ${periodA.label} against ${periodB.label}`,
        (row) => row.key,
      )}
    </motion.div>
  )
}
