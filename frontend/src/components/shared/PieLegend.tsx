/**
 * Text legend for a donut that renders its own wedges without a Recharts
 * `<Legend>` (dashboard-style: chart on top, clickable amount rows below).
 *
 * The rows are driven by the SAME `capPieSlices` output the chart renders, not a
 * hand-mirrored `slice(0, N)` -- that drifted the moment the chart's default cap
 * changed, leaving a legend row with no wedge and a swatch color the pie never
 * painted. Pass the capped array to both and they cannot disagree.
 */

import { formatCurrency } from '@/lib/formatters'
import { Button } from '@/components/ui'
import { sliceClickTarget, type PieSliceDatum } from '@/components/ui/pieSlices'
import { getChartColor } from '@/constants/chartColors'

interface PieLegendProps {
  /** Capped slices, exactly as handed to the chart (`capPieSlices(data)`). */
  readonly slices: readonly PieSliceDatum[]
  /** Called with a real category name. Never called for the folded rollup row. */
  readonly onSelect: (name: string) => void
  /** Tailwind focus-visible ring class matching the section's accent. */
  readonly focusRingClass: string
}

export default function PieLegend({ slices, onSelect, focusRingClass }: PieLegendProps) {
  return (
    <>
      {slices.map((item, i) => {
        // Same fill resolution `buildPieSlices` uses, so swatch == wedge.
        const swatch = { backgroundColor: item.color ?? getChartColor(i) }
        const target = sliceClickTarget(item)
        const label = (
          <span className="flex items-center gap-2 min-w-0">
            <span className="w-3 h-3 rounded-full shrink-0" style={swatch} />
            <span className="text-sm truncate" title={item.name}>{item.name}</span>
          </span>
        )
        const amount = (
          <span className="text-sm font-medium shrink-0">{formatCurrency(item.value)}</span>
        )
        // The folded "Other (N categories)" row is static text: its name matches
        // no transaction.category, so linking it opens an empty filtered list.
        if (target === null) {
          return (
            <div
              key={item.name}
              className="w-full flex items-center justify-between gap-2 py-1 px-1 -mx-1 text-text-tertiary"
            >
              {label}
              {amount}
            </div>
          )
        }
        return (
          <Button
            key={item.name}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSelect(target)}
            className={`w-full flex items-center justify-between gap-2 py-1 px-1 -mx-1 rounded-md hover:bg-[var(--overlay-2)] transition-colors text-left focus:outline-none focus-visible:ring-2 ${focusRingClass}`}
          >
            {label}
            {amount}
          </Button>
        )
      })}
    </>
  )
}
