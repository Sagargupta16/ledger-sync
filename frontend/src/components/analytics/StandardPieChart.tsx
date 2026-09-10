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
import { PieChart, Pie, Tooltip, type PieSectorDataItem } from 'recharts'
import { formatCurrency } from '@/lib/formatters'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import ChartTooltipContent from '@/components/ui/ChartTooltipContent'
import PieChartLedger from '@/components/ui/PieChartLedger'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
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
  const { animate } = useChartPresentation(filteredData.length)
  // Hover tracked by slice NAME, not index: the sector renderer recovers its row
  // from Recharts' `payload`, so nothing has to agree about rendered position.
  const [activeName, setActiveName] = useState<string | null>(null)
  const total = filteredData.reduce((sum, slice) => sum + slice.value, 0)
  const activeSlice = filteredData.find((slice) => slice.name === activeName)
  const formatValue = tooltipFormatter ?? formatCurrency
  const displayedValue = activeSlice && centerValue ? formatValue(activeSlice.value) : (centerValue ?? '')
  const displayedLabel = activeSlice && centerValue && total > 0
    ? `${((activeSlice.value / total) * 100).toFixed(1)}% of total`
    : centerLabel
  const animatedCenterValue = useAnimatedValue(displayedValue)

  if (filteredData.length === 0) {
    return <ChartEmptyState message={emptyMessage} height={height} />
  }

  const centerValueLength = displayedValue.length
  const centerValueFontSize = pickCenterValueFontSize(centerValueLength)

  return (
    <div className="@container min-w-0">
      <div className={showLegend ? 'grid min-w-0 items-center gap-x-6 gap-y-4 @[30rem]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]' : 'min-w-0'}>
        <div className="min-w-0">
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
                animationDuration={520}
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
                content={<ChartTooltipContent shareTotal={total} />}
                formatter={(value) => formatValue(typeof value === 'number' ? value : 0)}
              />
              {/* Center label for donut charts.
                  Font size auto-shrinks based on centerValue length so long
                  currency strings (e.g. "₹57,27,353") don't overflow the donut
                  inner ring on smaller chart heights. */}
              {centerLabel && (
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
                  {centerValue && (
                    <tspan
                      x="50%"
                      dy="-8"
                      fill={CHART_TEXT.primary}
                      fontSize={centerValueFontSize}
                      fontFamily="var(--font-mono)"
                      fontWeight="600"
                    >
                      {animatedCenterValue}
                    </tspan>
                  )}
                  <tspan x="50%" dy={centerValue ? '20' : '0'} fill={CHART_TEXT.subtle} fontSize="11">
                    {displayedLabel}
                  </tspan>
                </text>
              )}
            </PieChart>
          </ChartContainer>
        </div>
        {showLegend && (
          <PieChartLedger
            data={filteredData}
            total={total}
            formatValue={formatValue}
            activeName={activeName}
            onActiveChange={setActiveName}
            onSliceClick={onSliceClick}
            animate={animate}
          />
        )}
      </div>
      {/* Screen-reader fallback, rendered as a SIBLING of ChartContainer --
          inside it, the role="img" wrapper would make it presentational.
          Call sites must pass `ariaLabel` rather than wrapping this component in
          their own role="img" div, which would swallow the table too. */}
      {renderPieDataTable(
        filteredData,
        pickTableCaption(ariaLabel, filteredData.length),
        formatValue,
      )}
    </div>
  )
}
