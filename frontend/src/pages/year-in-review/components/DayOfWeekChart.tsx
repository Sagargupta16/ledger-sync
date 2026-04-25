import { useMemo } from 'react'

import StandardBarChart from '@/components/analytics/StandardBarChart'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
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

  const hasData = grid.some((c) => c.hasTx)

  if (!hasData) {
    return <ChartEmptyState height={192} />
  }

  return (
    <StandardBarChart
      data={data}
      dataKey="name"
      height={192}
      barGap={4}
      bars={[
        { key: 'Avg Spending', color: rawColors.app.red, fillOpacity: 0.8 },
        { key: 'Avg Earning', color: rawColors.app.green, fillOpacity: 0.8 },
      ]}
    />
  )
}
