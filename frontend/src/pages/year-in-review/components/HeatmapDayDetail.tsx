import { formatCurrency } from '@/lib/formatters'
import type { DayCell } from './DayOfWeekChart'

interface Props {
  hoveredDay: DayCell | null
}

export default function HeatmapDayDetail({ hoveredDay }: Readonly<Props>) {
  if (hoveredDay) {
    return (
      <>
        <span className="text-white font-medium">
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
  return (
    <>
      <span className="text-text-tertiary hidden md:inline">Hover over a day to see details</span>
      <span className="text-text-tertiary md:hidden">Tap a month to see details</span>
    </>
  )
}
