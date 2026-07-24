import { formatCurrency } from '@/lib/formatters'
import { getBillDotColor } from '../billUtils'
import type { PlacedBill } from '../types'

// Dot diameter (px) scales with amount so a heavy bill reads as a bigger dot.
// Floored so even the smallest bill stays tappable/visible.
const MIN_DOT_PX = 4
const MAX_DOT_PX = 9

interface Props {
  year: number
  month: number
  day: number
  isToday: boolean
  isSelected: boolean
  isCurrentMonth: boolean
  bills: PlacedBill[]
  /** Largest single-bill amount in the viewed month; the dot-size reference. */
  maxBillAmount: number
  onClick: () => void
}

export default function DayCell({
  year,
  month,
  day,
  isToday,
  isSelected,
  isCurrentMonth,
  bills,
  maxBillAmount,
  onClick,
}: Readonly<Props>) {
  const hasBills = bills.length > 0
  const maxDotsShown = 3

  const dotSize = (amount: number): number => {
    if (maxBillAmount <= 0) return MIN_DOT_PX
    const ratio = Math.min(1, Math.max(0, amount / maxBillAmount))
    return MIN_DOT_PX + ratio * (MAX_DOT_PX - MIN_DOT_PX)
  }

  const opacityClass = isCurrentMonth ? '' : 'opacity-30'
  const selectionClass = isSelected
    ? 'bg-app-blue/20 border border-app-blue/40'
    : `${isCurrentMonth ? 'hover:bg-[var(--overlay-4)]' : ''} border border-transparent`
  const todayBorderClass = isToday && !isSelected ? 'ring-2 ring-app-blue/50' : ''
  const interactionClass = isCurrentMonth ? 'cursor-pointer' : 'cursor-default'

  const dayNumberClass = (() => {
    if (isToday) return 'w-7 h-7 flex items-center justify-center rounded-full bg-app-blue text-on-accent'
    if (isSelected) return 'text-app-blue'
    if (isCurrentMonth) return 'text-foreground'
    return 'text-text-quaternary'
  })()

  const billLabel = (() => {
    if (!hasBills) return 'no bills'
    return `${bills.length} bill${bills.length === 1 ? '' : 's'}`
  })()
  const dateLabel = new Date(year, month, day).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const ariaLabel = isCurrentMonth
    ? `${dateLabel}, ${billLabel}${isToday ? ', today' : ''}${isSelected ? ', selected' : ''}`
    : `${dateLabel}, outside the current month`

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isCurrentMonth}
      aria-label={ariaLabel}
      aria-pressed={isCurrentMonth ? isSelected : undefined}
      className={`
        group relative flex min-h-[60px] min-w-11 w-full flex-col items-center justify-start rounded-xl p-1.5
        transition-colors duration-150 sm:min-h-[72px] sm:p-2
        ${interactionClass}
        ${opacityClass}
        ${selectionClass}
        ${todayBorderClass}
      `}
    >
      <span className={`text-sm font-medium leading-none ${dayNumberClass}`}>{day}</span>

      {hasBills && (
        <div className="flex items-center gap-0.5 mt-1.5 flex-wrap justify-center" aria-hidden="true">
          {bills.slice(0, maxDotsShown).map((bill) => {
            const size = dotSize(bill.amount)
            return (
              <div
                key={bill.key}
                className="rounded-full flex-shrink-0"
                style={{
                  width: size,
                  height: size,
                  backgroundColor: getBillDotColor(bill),
                }}
                title={`${bill.name} -- ${formatCurrency(bill.amount)}`}
              />
            )
          })}
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
