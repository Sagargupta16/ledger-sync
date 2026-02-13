import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ViewMode } from '@/lib/dateUtils'

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
          className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors"
          type="button"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-white font-medium min-w-30 text-center">
          {new Date(currentMonth + '-01').toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          })}
        </span>
        <button
          onClick={handleNextMonth}
          className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors"
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
          className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors"
          type="button"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-white font-medium min-w-25 text-center">Year {currentYear}</span>
        <button
          onClick={handleNextYear}
          className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors"
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
