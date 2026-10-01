import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui'

import { formatMonthYear } from '../billUtils'

interface BillMonthNavigatorProps {
  readonly viewYear: number
  readonly viewMonth: number
  readonly isCurrentViewToday: boolean
  readonly onPreviousMonth: () => void
  readonly onNextMonth: () => void
  readonly onToday: () => void
}

/**
 * Month switcher for the whole Bill Calendar page. The summary cards, the
 * calendar and the selected-day panel all follow the viewed month, so it lives
 * in the page's sticky toolbar rather than inside the calendar card.
 */
export default function BillMonthNavigator({
  viewYear,
  viewMonth,
  isCurrentViewToday,
  onPreviousMonth,
  onNextMonth,
  onToday,
}: BillMonthNavigatorProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onPreviousMonth}
        aria-label="Previous month"
        icon={<ChevronLeft className="h-5 w-5" />}
        className="p-2"
      />

      <div className="flex min-w-0 items-center justify-center gap-2 sm:gap-3">
        <h2 className="truncate text-base font-semibold text-foreground sm:text-lg">
          {formatMonthYear(viewYear, viewMonth)}
        </h2>
        {!isCurrentViewToday && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToday}
            className="bg-app-blue/15 text-app-blue hover:bg-app-blue/25 hover:text-app-blue"
          >
            Today
          </Button>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onNextMonth}
        aria-label="Next month"
        icon={<ChevronRight className="h-5 w-5" />}
        className="p-2"
      />
    </div>
  )
}
