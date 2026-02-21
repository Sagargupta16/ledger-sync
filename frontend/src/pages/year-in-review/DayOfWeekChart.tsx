import { useMemo } from 'react'
import { CHART_AXIS_COLOR } from '@/constants/chartColors'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { chartTooltipProps } from '@/components/ui'
import { rawColors } from '@/constants/colors'

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

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
          <XAxis dataKey="name" tick={{ fill: CHART_AXIS_COLOR, fontSize: 12 }} />
          <YAxis tickFormatter={(v: number) => formatCurrencyShort(v)} tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} />
          <RechartsTooltip
            {...chartTooltipProps}
            formatter={(value: number | undefined) => (value === undefined ? '' : formatCurrency(value))}
          />
          <Bar dataKey="Avg Spending" fill={rawColors.ios.red} radius={[4, 4, 0, 0]} opacity={0.8} />
          <Bar dataKey="Avg Earning" fill={rawColors.ios.green} radius={[4, 4, 0, 0]} opacity={0.8} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
