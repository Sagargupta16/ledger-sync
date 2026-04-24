import { getBillDotColor } from '../billUtils'
import type { PlacedBill } from '../types'

interface Props {
  day: number
  isToday: boolean
  isSelected: boolean
  isCurrentMonth: boolean
  bills: PlacedBill[]
  onClick: () => void
}

export default function DayCell({
  day,
  isToday,
  isSelected,
  isCurrentMonth,
  bills,
  onClick,
}: Readonly<Props>) {
  const hasBills = bills.length > 0
  const maxDotsShown = 3

  const opacityClass = isCurrentMonth ? '' : 'opacity-30'
  const selectionClass = isSelected
    ? 'bg-app-blue/20 border border-app-blue/40'
    : 'hover:bg-white/8 border border-transparent'
  const todayBorderClass = isToday && !isSelected ? 'ring-2 ring-app-blue/50' : ''

  const dayNumberClass = (() => {
    if (isToday) return 'w-7 h-7 flex items-center justify-center rounded-full bg-app-blue text-white'
    if (isSelected) return 'text-app-blue'
    if (isCurrentMonth) return 'text-white'
    return 'text-text-quaternary'
  })()

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        relative flex flex-col items-center justify-start p-1.5 sm:p-2 rounded-xl min-h-[60px] sm:min-h-[72px]
        transition-all duration-200 cursor-pointer group
        ${opacityClass}
        ${selectionClass}
        ${todayBorderClass}
      `}
    >
      <span className={`text-sm font-medium leading-none ${dayNumberClass}`}>{day}</span>

      {hasBills && (
        <div className="flex items-center gap-0.5 mt-1.5 flex-wrap justify-center">
          {bills.slice(0, maxDotsShown).map((bill) => (
            <div
              key={bill.key}
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: getBillDotColor(bill) }}
              title={bill.name}
            />
          ))}
          {bills.length > maxDotsShown && (
            <span className="text-[9px] text-muted-foreground ml-0.5">
              +{bills.length - maxDotsShown}
            </span>
          )}
        </div>
      )}
    </button>
  )
}
