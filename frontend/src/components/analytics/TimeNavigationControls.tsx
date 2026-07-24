import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui'
import { formatMonthKey, type ViewMode } from '@/lib/dateUtils'

interface TimeNavigationControlsProps {
  viewMode: ViewMode
  currentYear: number
  currentMonth: string
  totalTransactions: number
  transactionLabel?: string
  handlePrevYear: () => void
  handleNextYear: () => void
  handlePrevMonth: () => void
  handleNextMonth: () => void
}

export default function TimeNavigationControls({
  viewMode,
  currentYear,
  currentMonth,
  totalTransactions,
  transactionLabel = 'transactions',
  handlePrevYear,
  handleNextYear,
  handlePrevMonth,
  handleNextMonth,
}: Readonly<TimeNavigationControlsProps>) {
  if (viewMode === 'monthly') {
    return (
      <div className="flex items-center gap-3">
        <Button
          onClick={handlePrevMonth}
          aria-label="Previous month"
          type="button"
          variant="ghost"
          size="sm"
          className="p-0 text-muted-foreground"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Button>
        <span className="text-foreground font-medium min-w-30 text-center">
          {formatMonthKey(currentMonth, { month: 'long', year: 'numeric' })}
        </span>
        <Button
          onClick={handleNextMonth}
          aria-label="Next month"
          type="button"
          variant="ghost"
          size="sm"
          className="p-0 text-muted-foreground"
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </Button>
        <span className="text-muted-foreground text-sm ml-2">
          {totalTransactions} {transactionLabel}
        </span>
      </div>
    )
  }

  if (viewMode === 'yearly') {
    return (
      <div className="flex items-center gap-3">
        <Button
          onClick={handlePrevYear}
          aria-label="Previous year"
          type="button"
          variant="ghost"
          size="sm"
          className="p-0 text-muted-foreground"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Button>
        <span className="text-foreground font-medium min-w-25 text-center">Year {currentYear}</span>
        <Button
          onClick={handleNextYear}
          aria-label="Next year"
          type="button"
          variant="ghost"
          size="sm"
          className="p-0 text-muted-foreground"
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </Button>
        <span className="text-muted-foreground text-sm ml-2">
          {totalTransactions} {transactionLabel}
        </span>
      </div>
    )
  }

  // all_time
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground text-sm">
        {totalTransactions} {transactionLabel}
      </span>
    </div>
  )
}
