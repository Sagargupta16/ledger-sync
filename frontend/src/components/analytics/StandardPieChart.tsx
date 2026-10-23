/**
 * Donut (or pie) with a ranked ledger, drawn by the chart kit's PieChart. The
 * slices sweep open clockwise from 12 o'clock once the chart scrolls into view
 * while the centre amount counts up. Hovering a slice or a ledger row lifts
 * that slice, dims the rest and swaps the centre to its amount and share.
 *
 * Usage:
 *   <StandardPieChart
 *     data={[
 *       { name: 'Income', value: 50000, color: SEMANTIC_COLORS.income },
 *       { name: 'Expense', value: 30000, color: SEMANTIC_COLORS.expense },
 *     ]}
 *   />
 */

import { useMemo, useState } from 'react'

import PieChart from '@/components/charts/PieChart'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import PieChartLedger from '@/components/ui/PieChartLedger'
import { MAX_PIE_SLICES, type PieSliceDatum } from '@/components/ui/pieSlices'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import { formatCurrency, formatPercent } from '@/lib/formatters'

import PieCenterReadout from './PieCenterReadout'
import {
  buildPieSlices,
  holeRatio,
  pickTableCaption,
  renderPieDataTable,
  toPieData,
  type PieRadius,
} from './standardPieChartParts'

/** The 3 degree gaps this donut has always drawn between wedges, in radians. */
const PAD_ANGLE = (3 * Math.PI) / 180

interface StandardPieChartProps {
  readonly data: PieSliceDatum[]
  readonly height?: number
  /** Hole radius as a share of the frame ('0%' draws a full pie); only its ratio to `outerRadius` matters. */
  readonly innerRadius?: PieRadius
  readonly outerRadius?: PieRadius
  readonly showLegend?: boolean
  readonly emptyMessage?: string
  /** Amount format for the centre, the ledger and the screen-reader table. */
  readonly tooltipFormatter?: (value: number) => string
  /** Line under the centre amount, such as "Total". */
  readonly centerLabel?: string
  readonly centerValue?: string
  /**
   * Click handler for pie slices. Receives the clicked category's name and adds
   * a pointer cursor. NOT fired for the synthetic "Other (N categories)" wedge:
   * that name matches no `transaction.category`, so deep-linking it would land
   * the user on a permanently empty filtered list.
   */
  readonly onSliceClick?: (name: string) => void
  /**
   * Total wedges to render, "Other" included. The smallest slices beyond this
   * count merge into a single muted "Other (N categories)" wedge whose value is
   * the exact tail sum. Defaults to `MAX_PIE_SLICES` (7), the project's
   * data-viz-fit rule, so every call-site inherits a legible pie. Pass a larger
   * number to opt out explicitly, or 0 to disable capping entirely.
   */
  readonly maxSlices?: number
  /** Accessible description of the chart; the chart frame carries role="img". */
  readonly ariaLabel?: string
}

export default function StandardPieChart({
  data,
  height = 300,
  innerRadius = '60%',
  outerRadius = '85%',
  showLegend = true,
  emptyMessage,
  tooltipFormatter,
  centerLabel,
  centerValue,
  onSliceClick,
  maxSlices = MAX_PIE_SLICES,
  ariaLabel,
}: StandardPieChartProps) {
  // Memoized so the sort + reduce only re-run when the data or cap changes,
  // not on every hover (hovering re-renders this component constantly).
  const slices = useMemo(() => buildPieSlices(data, maxSlices), [data, maxSlices])
  // Also subscribes to the theme: a toggle re-renders here, so `toPieData`
  // and the ledger read every slice's live colour.
  const { animate } = useChartPresentation(slices.length)
  // One hover state for the wedges and the ledger rows, keyed by slice name.
  const [activeName, setActiveName] = useState<string | null>(null)
  const formatValue = tooltipFormatter ?? formatCurrency

  if (slices.length === 0) {
    return <ChartEmptyState message={emptyMessage} height={height} />
  }

  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  const active = slices.find((slice) => slice.name === activeName)
  // No tooltip any more: the hole names the active slice, with its amount and share.
  const center = active ? (
    <PieCenterReadout
      eyebrow={active.name}
      value={formatValue(active.value)}
      caption={`${formatPercent((active.value / total) * 100)} of total`}
    />
  ) : (
    <PieCenterReadout value={centerValue} caption={centerLabel} />
  )

  return (
    <div className="@container min-w-0">
      <div className={showLegend ? 'grid min-w-0 items-center gap-x-6 gap-y-4 @[30rem]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]' : 'min-w-0'}>
        <div className="min-w-0">
          <PieChart
            data={toPieData(slices)}
            innerRadius={holeRatio(innerRadius, outerRadius)}
            padAngle={PAD_ANGLE}
            activeKey={activeName}
            onActiveChange={setActiveName}
            onSelect={onSliceClick}
            centerLabel={center}
            formatValue={formatValue}
            height={height}
            ariaLabel={ariaLabel}
          />
        </div>
        {showLegend && (
          <PieChartLedger
            data={slices}
            total={total}
            formatValue={formatValue}
            activeName={activeName}
            onActiveChange={setActiveName}
            onSliceClick={onSliceClick}
            animate={animate}
          />
        )}
      </div>
      {/* Screen-reader fallback, rendered as a SIBLING of the chart frame --
          inside it, the role="img" frame would make it presentational.
          Call sites must pass `ariaLabel` rather than wrapping this component in
          their own role="img" div, which would swallow the table too. */}
      {renderPieDataTable(slices, pickTableCaption(ariaLabel, slices.length), formatValue)}
    </div>
  )
}
