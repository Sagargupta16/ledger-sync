import { memo } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { Button } from '@/components/ui'
import { type ViewMode } from '@/lib/dateUtils'
import { cn } from '@/lib/cn'

interface PeriodNavigatorProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  periodLabel: string
  onPrevious: () => void
  onNext: () => void
  canNavigate?: boolean
  showAllTime?: boolean
  className?: string
}

/**
 * Reusable period navigation component
 * Used for navigating between months/years/all-time in analytics views
 */
export const PeriodNavigator = memo(function PeriodNavigator({
  viewMode,
  onViewModeChange,
  periodLabel,
  onPrevious,
  onNext,
  canNavigate = true,
  showAllTime = true,
  className,
}: PeriodNavigatorProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-4', className)}>
      {/* View Mode Toggle */}
      <div className="flex bg-[var(--overlay-2)] rounded-lg p-1" role="tablist" aria-label="Period view mode">
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'monthly'}
          onClick={() => onViewModeChange('monthly')}
          className={cn(
            'min-h-11 rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ease-out sm:min-h-9',
            viewMode === 'monthly'
              ? 'bg-[var(--overlay-5)] text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Monthly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'yearly'}
          onClick={() => onViewModeChange('yearly')}
          className={cn(
            'min-h-11 rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ease-out sm:min-h-9',
            viewMode === 'yearly'
              ? 'bg-[var(--overlay-5)] text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Yearly
        </button>
        {showAllTime && (
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'all_time'}
            onClick={() => onViewModeChange('all_time')}
            className={cn(
              'min-h-11 rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ease-out sm:min-h-9',
              viewMode === 'all_time'
                ? 'bg-[var(--overlay-5)] text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            All Time
          </button>
        )}
      </div>

      {/* Period Navigation */}
      {canNavigate && viewMode !== 'all_time' && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onPrevious}
            className="p-0 text-text-tertiary"
            aria-label="Previous period"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Button>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--overlay-2)] rounded-lg min-w-[140px] justify-center">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium text-foreground">{periodLabel}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onNext}
            className="p-0 text-text-tertiary"
            aria-label="Next period"
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  )
})
