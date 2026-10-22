import { formatCurrency, formatDate } from '@/lib/formatters'
import type { DayCell } from './DayOfWeekChart'

interface Props {
  hoveredDay: DayCell | null
  /** Day picked with a click, tap, Enter or Space; shown while nothing is hovered. */
  selectedDay?: DayCell | null
  monthlyDetail: MonthlyHeatmapDetail | null
}

interface MonthlyHeatmapDetail {
  label: string
  expense: number
  income: number
  net: number
}

export default function HeatmapDayDetail({
  hoveredDay,
  selectedDay = null,
  monthlyDetail,
}: Readonly<Props>) {
  const day = hoveredDay ?? selectedDay
  if (day) {
    return (
      <>
        <span className="text-foreground font-medium">
          {formatDate(day.date, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </span>
        <span className="text-app-red">Spending: {formatCurrency(day.expense)}</span>
        <span className="text-app-green">Earning: {formatCurrency(day.income)}</span>
        <span className={day.net >= 0 ? 'text-app-blue' : 'text-app-orange'}>
          Savings: {day.net >= 0 ? '+' : ''}
          {formatCurrency(day.net)}
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
      <span className="text-text-tertiary lg:hidden">Tap a day or month to see details</span>
    </>
  )
}
