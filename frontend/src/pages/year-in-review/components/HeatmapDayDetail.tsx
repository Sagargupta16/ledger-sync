import { formatCurrency } from '@/lib/formatters'
import type { DayCell } from './DayOfWeekChart'

interface Props {
  hoveredDay: DayCell | null
  monthlyDetail: MonthlyHeatmapDetail | null
}

export interface MonthlyHeatmapDetail {
  label: string
  expense: number
  income: number
  net: number
}

export default function HeatmapDayDetail({ hoveredDay, monthlyDetail }: Readonly<Props>) {
  if (hoveredDay) {
    return (
      <>
        <span className="text-foreground font-medium">
          {new Date(hoveredDay.date + 'T00:00:00').toLocaleDateString('en-IN', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </span>
        <span className="text-app-red">Spending: {formatCurrency(hoveredDay.expense)}</span>
        <span className="text-app-green">Earning: {formatCurrency(hoveredDay.income)}</span>
        <span className={hoveredDay.net >= 0 ? 'text-app-blue' : 'text-app-orange'}>
          Savings: {hoveredDay.net >= 0 ? '+' : ''}
          {formatCurrency(hoveredDay.net)}
        </span>
      </>
    )
  }

  if (monthlyDetail) {
    return (
      <>
        <span className="font-medium text-foreground">{monthlyDetail.label}</span>
        <span className="text-app-red">
          Spending: {formatCurrency(monthlyDetail.expense)}
        </span>
        <span className="text-app-green">
          Earning: {formatCurrency(monthlyDetail.income)}
        </span>
        <span className={monthlyDetail.net >= 0 ? 'text-app-blue' : 'text-app-orange'}>
          Savings: {monthlyDetail.net >= 0 ? '+' : ''}
          {formatCurrency(monthlyDetail.net)}
        </span>
      </>
    )
  }

  return (
    <>
      <span className="hidden text-text-tertiary lg:inline">
        Hover over a day to see details
      </span>
      <span className="text-text-tertiary lg:hidden">Tap a month to see details</span>
    </>
  )
}
