/**
 * Text legend for a donut that renders its own wedges without a Recharts
 * `<Legend>` (dashboard-style: chart on top, clickable amount rows below).
 *
 * The rows are driven by the SAME `capPieSlices` output the chart renders, not a
 * hand-mirrored `slice(0, N)` -- that drifted the moment the chart's default cap
 * changed, leaving a legend row with no wedge and a swatch color the pie never
 * painted. Pass the capped array to both and they cannot disagree.
 */

import { useState } from 'react'

import { formatCurrency } from '@/lib/formatters'
import PieChartLedger from '@/components/ui/PieChartLedger'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import type { PieSliceDatum } from '@/components/ui/pieSlices'
import { SEMANTIC_COLORS, getChartColor } from '@/constants/chartColors'

interface PieLegendProps {
  /** Capped slices, exactly as handed to the chart (`capPieSlices(data)`). */
  readonly slices: readonly PieSliceDatum[]
  /** Called with a real category name. Never called for the folded rollup row. */
  readonly onSelect: (name: string) => void
  /** Tailwind focus-visible ring class matching the section's accent. */
  readonly focusRingClass: string
}

export default function PieLegend({ slices, onSelect, focusRingClass }: PieLegendProps) {
  const [activeName, setActiveName] = useState<string | null>(null)
  const { animate } = useChartPresentation(slices.length)
  const data = slices.map((slice, index) => ({
    ...slice,
    fill: slice.isOther ? SEMANTIC_COLORS.muted : (slice.color ?? getChartColor(index)),
  }))

  if (data.length === 0) return null

  return (
    <PieChartLedger
      data={data}
      total={slices.reduce((sum, slice) => sum + slice.value, 0)}
      formatValue={formatCurrency}
      activeName={activeName}
      onActiveChange={setActiveName}
      onSliceClick={onSelect}
      focusRingClass={focusRingClass}
      animate={animate}
    />
  )
}
