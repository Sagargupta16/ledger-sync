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

import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import { formatCurrency } from '@/lib/formatters'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import { LEGEND_DEFAULTS, shouldAnimate } from '@/components/ui/chartDefaults'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { getChartColor } from '@/constants/chartColors'

interface PieDataItem {
  name: string
  value: number
  color?: string
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
}

export default function StandardPieChart({
  data,
  height = 300,
  innerRadius = '55%',
  outerRadius = '80%',
  showLegend = true,
  showLabels = false,
  emptyMessage,
  tooltipFormatter,
  centerLabel,
  centerValue,
  paddingAngle = 2,
  onSliceClick,
}: StandardPieChartProps) {
  const filteredData = data.filter((d) => d.value > 0)

  if (filteredData.length === 0) {
    return <ChartEmptyState message={emptyMessage} height={height} />
  }

  const animate = shouldAnimate(filteredData.length)

  return (
    <ChartContainer height={height}>
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
          strokeWidth={0}
          isAnimationActive={animate}
          animationDuration={600}
          animationEasing="ease-out"
          {...(onSliceClick && {
            onClick: (data: { name?: string }) => {
              if (data?.name) onSliceClick(data.name)
            },
            style: { cursor: 'pointer' },
          })}
          label={showLabels ? (({ name, percent }: { name?: string; percent?: number }) => (
            `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
          )) as never : undefined}
          labelLine={showLabels ? { stroke: '#71717a', strokeWidth: 1 } : undefined}
        >
          {filteredData.map((entry, i) => (
            <Cell
              key={entry.name}
              fill={entry.color ?? getChartColor(i)}
              style={{ filter: 'brightness(1.05)' }}
            />
          ))}
        </Pie>
        <Tooltip
          {...chartTooltipProps}
          formatter={(value: number | undefined) => (tooltipFormatter ?? formatCurrency)(value ?? 0)}
        />
        {showLegend && (
          <Legend
            {...LEGEND_DEFAULTS}
            layout="horizontal"
            align="center"
            verticalAlign="bottom"
          />
        )}
        {/* Center label for donut charts */}
        {centerLabel && (
          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
            {centerValue && (
              <tspan x="50%" dy="-8" fill="#fafafa" fontSize="20" fontWeight="700">
                {centerValue}
              </tspan>
            )}
            <tspan x="50%" dy={centerValue ? '22' : '0'} fill="#71717a" fontSize="12">
              {centerLabel}
            </tspan>
          </text>
        )}
      </PieChart>
    </ChartContainer>
  )
}
