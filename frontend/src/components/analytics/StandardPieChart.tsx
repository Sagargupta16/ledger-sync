/**
 * Reusable pie/donut chart wrapper with premium styling.
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
import { PieChart, Pie, Tooltip, Legend, type PieSectorDataItem } from 'recharts'
import { formatCurrency } from '@/lib/formatters'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import { LEGEND_DEFAULTS, shouldAnimate } from '@/components/ui/chartDefaults'
import { MAX_PIE_SLICES, sliceClickTarget, type PieSliceDatum } from '@/components/ui/pieSlices'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { useAnimatedValue } from '@/hooks/useAnimatedValue'
import { CHART_TEXT } from '@/constants/chartColors'

import {
  buildPieSlices,
  pickCenterValueFontSize,
  pickTableCaption,
  renderPieDataTable,
  renderPieSectorShape,
  slicePayload,
} from './standardPieChartParts'

type PieDataItem = PieSliceDatum

interface StandardPieChartProps {
  readonly data: PieDataItem[]
  readonly height?: number
  /** Inner radius for donut effect (0 = full pie) */
  readonly innerRadius?: number | string
  readonly outerRadius?: number | string
  readonly showLegend?: boolean
  readonly showLabels?: boolean
  readonly emptyMessage?: string
  readonly tooltipFormatter?: (value: number) => string
  /** Center label text (shown inside donut) */
  readonly centerLabel?: string
  readonly centerValue?: string
  readonly paddingAngle?: number
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
  /** Accessible description of the chart, forwarded to ChartContainer (role=img). */
  readonly ariaLabel?: string
}

export default function StandardPieChart({
  data,
  height = 300,
  innerRadius = '60%',
  outerRadius = '85%',
  showLegend = true,
  showLabels = false,
  emptyMessage,
  tooltipFormatter,
  centerLabel,
  centerValue,
  paddingAngle = 3,
  onSliceClick,
  maxSlices = MAX_PIE_SLICES,
  ariaLabel,
}: StandardPieChartProps) {
  // Memoized so the sort + reduce only re-run when the data or cap changes,
  // not on every hover (hovering re-renders this component constantly).
  const filteredData = useMemo(() => buildPieSlices(data, maxSlices), [data, maxSlices])
  // Hover tracked by slice NAME, not index: the sector renderer recovers its row
  // from Recharts' `payload`, so nothing has to agree about rendered position.
  const [activeName, setActiveName] = useState<string | null>(null)
  // Donut center figure counts up alongside the sweep-in of the ring.
  const animatedCenterValue = useAnimatedValue(centerValue ?? '')

  if (filteredData.length === 0) {
    return <ChartEmptyState message={emptyMessage} height={height} />
  }

  const animate = shouldAnimate(filteredData.length)

  const centerValueLength = centerValue?.length ?? 0
  const centerValueFontSize = pickCenterValueFontSize(centerValueLength)
  const formatValue = tooltipFormatter ?? formatCurrency

  return (
    <>
      <ChartContainer height={height} ariaLabel={ariaLabel}>
        <PieChart>
          <Pie
            data={filteredData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={paddingAngle}
            cornerRadius={4}
            strokeWidth={0}
            isAnimationActive={animate}
            animationDuration={600}
            animationEasing="ease-out"
            label={showLabels ? (({ name, percent }: { name?: string; percent?: number }) => (
              `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
            )) as never : undefined}
            labelLine={showLabels ? { stroke: CHART_TEXT.subtle, strokeWidth: 1 } : undefined}
            // Wedge colour rides on each datum's `fill`, and the hover/click paint
            // comes from this `shape` renderer. Together they replace the `<Cell>`
            // children, which Recharts deprecates and removes in 4.0. The hover
            // and click handlers move onto the `<Pie>`, which already dispatches
            // them per sector with the row on `payload`.
            shape={renderPieSectorShape(activeName, Boolean(onSliceClick))}
            onMouseEnter={(entry: PieSectorDataItem) =>
              setActiveName(slicePayload(entry).name ?? null)
            }
            onMouseLeave={() => setActiveName(null)}
            onClick={(entry: PieSectorDataItem) => {
              const target = sliceClickTarget(slicePayload(entry))
              if (onSliceClick && target !== null) onSliceClick(target)
            }}
          />
          <Tooltip
            {...chartTooltipProps}
            formatter={(value) => formatValue(typeof value === 'number' ? value : 0)}
          />
          {/* `align="center"` / `verticalAlign="bottom"` were passed here and
              dropped: recharts 3.10 deprecates both in favour of `position`, and
              both values were already the component defaults
              (`legendDefaultProps` in `recharts/component/Legend`), so the
              rendered position is unchanged. `layout="horizontal"` is NOT
              deprecated and is kept -- the 3.10 default is `auto`, which only
              resolves to horizontal because `position` is undefined here. */}
          {showLegend && <Legend {...LEGEND_DEFAULTS} layout="horizontal" />}
          {/* Center label for donut charts.
              Font size auto-shrinks based on centerValue length so long
              currency strings (e.g. "₹57,27,353") don't overflow the donut
              inner ring on smaller chart heights. */}
          {centerLabel && (
            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
              {centerValue && (
                <tspan
                  x="50%"
                  dy="-8"
                  fill={CHART_TEXT.primary}
                  fontSize={centerValueFontSize}
                  fontWeight="700"
                >
                  {animatedCenterValue}
                </tspan>
              )}
              <tspan x="50%" dy={centerValue ? '20' : '0'} fill={CHART_TEXT.subtle} fontSize="11">
                {centerLabel}
              </tspan>
            </text>
          )}
        </PieChart>
      </ChartContainer>
      {/* Screen-reader fallback, rendered as a SIBLING of ChartContainer --
          inside it, the role="img" wrapper would make it presentational.
          Call sites must pass `ariaLabel` rather than wrapping this component in
          their own role="img" div, which would swallow the table too. */}
      {renderPieDataTable(
        filteredData,
        pickTableCaption(ariaLabel, filteredData.length),
        formatValue,
      )}
    </>
  )
}
