import { ChevronLeft, ChevronRight } from 'lucide-react'
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
        <button
          onClick={handlePrevMonth}
          aria-label="Previous month"
          className="p-1.5 hover:bg-[var(--overlay-5)] rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          type="button"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-foreground font-medium min-w-30 text-center">
          {formatMonthKey(currentMonth, { month: 'long', year: 'numeric' })}
        </span>
        <button
          onClick={handleNextMonth}
          aria-label="Next month"
          className="p-1.5 hover:bg-[var(--overlay-5)] rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          type="button"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <span className="text-muted-foreground text-sm ml-2">
          {totalTransactions} {transactionLabel}
        </span>
      </div>
    )
  }

  if (viewMode === 'yearly') {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={handlePrevYear}
          aria-label="Previous year"
          className="p-1.5 hover:bg-[var(--overlay-5)] rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          type="button"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-foreground font-medium min-w-25 text-center">Year {currentYear}</span>
        <button
          onClick={handleNextYear}
          aria-label="Next year"
          className="p-1.5 hover:bg-[var(--overlay-5)] rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          type="button"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
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
