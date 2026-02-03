import { memo } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
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
      <div className="flex bg-white/5 rounded-lg p-1" role="tablist" aria-label="Period view mode">
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'monthly'}
          onClick={() => onViewModeChange('monthly')}
          className={cn(
            'px-3 py-1.5 text-sm rounded-md transition-all',
            viewMode === 'monthly'
              ? 'bg-primary text-white'
              : 'text-gray-400 hover:text-white'
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
            'px-3 py-1.5 text-sm rounded-md transition-all',
            viewMode === 'yearly'
              ? 'bg-primary text-white'
              : 'text-gray-400 hover:text-white'
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
              'px-3 py-1.5 text-sm rounded-md transition-all',
              viewMode === 'all_time'
                ? 'bg-primary text-white'
                : 'text-gray-400 hover:text-white'
            )}
          >
            All Time
          </button>
        )}
      </div>

      {/* Period Navigation */}
      {canNavigate && viewMode !== 'all_time' && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrevious}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Previous period"
          >
            <ChevronLeft className="w-5 h-5 text-gray-400" />
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg min-w-[140px] justify-center">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="font-medium text-white">{periodLabel}</span>
          </div>
          <button
            type="button"
            onClick={onNext}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Next period"
          >
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      )}
    </div>
  )
})
