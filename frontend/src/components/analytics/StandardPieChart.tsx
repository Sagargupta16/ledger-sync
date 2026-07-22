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
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import { formatCurrency } from '@/lib/formatters'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import { LEGEND_DEFAULTS, shouldAnimate } from '@/components/ui/chartDefaults'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { useAnimatedValue } from '@/hooks/useAnimatedValue'
import { getChartColor, SEMANTIC_COLORS, CHART_TEXT } from '@/constants/chartColors'

interface PieDataItem {
  name: string
  value: number
  color?: string
}

/**
 * Shrink the donut center value font as the string grows so it doesn't
 * overflow past the inner radius. Tuned against typical donut sizes
 * (160-300 px) and currency strings up to ~12 chars.
 */
function pickCenterValueFontSize(length: number): number {
  if (length <= 6) return 22
  if (length <= 8) return 18
  if (length <= 10) return 15
  return 13
}

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
  /** Click handler for pie slices. Receives the clicked item's name. Adds pointer cursor. */
  readonly onSliceClick?: (name: string) => void
  /**
   * Cap the number of slices. The smallest slices beyond this count are merged
   * into a single muted "Other" slice. Defaults to 8 so a many-category pie
   * stays readable and the 12-color palette never repeats a color on adjacent
   * wedges. Pass 0 to disable capping.
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
  maxSlices = 8,
  ariaLabel,
}: StandardPieChartProps) {
  // Cap slice count: keep the largest (maxSlices - 1) and fold the rest into a
  // single muted "Other" slice, so a 15-30 category pie stays legible and the
  // 12-color palette never collides on adjacent wedges. Memoized so the sort +
  // reduce only re-run when the data or cap changes, not on every hover.
  const filteredData = useMemo(() => {
    const positive = data.filter((d) => d.value > 0)
    if (maxSlices <= 0 || positive.length <= maxSlices) return positive
    const sorted = [...positive].sort((a, b) => b.value - a.value)
    const head = sorted.slice(0, maxSlices - 1)
    const otherValue = sorted.slice(maxSlices - 1).reduce((s, d) => s + d.value, 0)
    return otherValue > 0
      ? [...head, { name: 'Other', value: otherValue, color: SEMANTIC_COLORS.muted }]
      : head
  }, [data, maxSlices])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  // Donut center figure counts up alongside the sweep-in of the ring.
  const animatedCenterValue = useAnimatedValue(centerValue ?? '')

  if (filteredData.length === 0) {
    return <ChartEmptyState message={emptyMessage} height={height} />
  }

  const animate = shouldAnimate(filteredData.length)

  const centerValueLength = centerValue?.length ?? 0
  const centerValueFontSize = pickCenterValueFontSize(centerValueLength)

  return (
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
        >
          {filteredData.map((entry, i) => {
            const isActive = activeIndex === i
            const isDimmed = activeIndex !== null && !isActive
            return (
              <Cell
                key={entry.name}
                fill={entry.color ?? getChartColor(i)}
                style={{
                  filter: isActive ? 'brightness(1.18)' : 'brightness(1.05)',
                  cursor: onSliceClick ? 'pointer' : 'default',
                  transition: 'opacity 200ms ease, filter 200ms ease',
                  opacity: isDimmed ? 0.4 : 1,
                  transformOrigin: '50% 50%',
                }}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
                onClick={() => {
                  if (onSliceClick) onSliceClick(entry.name)
                }}
              />
            )
          })}
        </Pie>
        <Tooltip
          {...chartTooltipProps}
          formatter={(value) => (tooltipFormatter ?? formatCurrency)(typeof value === 'number' ? value : 0)}
        />
        {showLegend && (
          <Legend
            {...LEGEND_DEFAULTS}
            layout="horizontal"
            align="center"
            verticalAlign="bottom"
          />
        )}
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
  )
}
