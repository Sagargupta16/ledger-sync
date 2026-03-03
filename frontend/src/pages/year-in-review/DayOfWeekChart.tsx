import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts'
import { formatCurrency } from '@/lib/formatters'
import { chartTooltipProps, ChartContainer, GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, BAR_RADIUS, shouldAnimate } from '@/components/ui'
import { rawColors } from '@/constants/colors'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export interface DayCell {
  date: string
  expense: number
  income: number
  net: number
  dayOfWeek: number
  weekIndex: number
  month: number
  isToday: boolean
  hasTx: boolean
}

export interface DayOfWeekChartProps {
  grid: DayCell[]
}

export default function DayOfWeekChart({ grid }: Readonly<DayOfWeekChartProps>) {
  const data = useMemo(() => {
    const totals: Record<number, { expense: number; income: number; count: number }> = {}
    for (let i = 0; i < 7; i++) totals[i] = { expense: 0, income: 0, count: 0 }

    for (const cell of grid) {
      totals[cell.dayOfWeek].expense += cell.expense
      totals[cell.dayOfWeek].income += cell.income
      totals[cell.dayOfWeek].count++
    }

    return DAYS.map((d, i) => ({
      name: d,
      'Avg Spending': totals[i].count > 0 ? totals[i].expense / totals[i].count : 0,
      'Avg Earning': totals[i].count > 0 ? totals[i].income / totals[i].count : 0,
    }))
  }, [grid])

  const hasData = grid.some(c => c.hasTx)

  if (!hasData) {
    return <ChartEmptyState height={192} />
  }

  return (
    <div className="h-48">
      <ChartContainer>
        <BarChart data={data} barGap={4}>
          <CartesianGrid {...GRID_DEFAULTS} />
          <XAxis {...xAxisDefaults(data.length)} dataKey="name" />
          <YAxis {...yAxisDefaults()} />
          <RechartsTooltip
            {...chartTooltipProps}
            formatter={(value: number | undefined) => (value === undefined ? '' : formatCurrency(value))}
          />
          <Bar dataKey="Avg Spending" fill={rawColors.ios.red} radius={BAR_RADIUS} opacity={0.8} isAnimationActive={shouldAnimate(data.length)} animationDuration={600} animationEasing="ease-out" />
          <Bar dataKey="Avg Earning" fill={rawColors.ios.green} radius={BAR_RADIUS} opacity={0.8} isAnimationActive={shouldAnimate(data.length)} animationDuration={600} animationEasing="ease-out" />
        </BarChart>
      </ChartContainer>
    </div>
  )
}
