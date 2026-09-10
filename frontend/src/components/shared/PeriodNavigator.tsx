import { memo, useId } from 'react'
import { motion } from 'motion/react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { Button } from '@/components/ui'
import { DURATION, EASING, TAP_FEEDBACK } from '@/constants/animations'
import { type ViewMode } from '@/lib/dateUtils'
import { cn } from '@/lib/cn'
import { useMotionStore } from '@/store/motionStore'

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

const viewModes: { value: ViewMode; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'all_time', label: 'All Time' },
]

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
  const activeId = useId()
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')
  const transition = { duration: reduceMotion ? 0 : DURATION.quick, ease: EASING.cinematic }
  const availableModes = showAllTime ? viewModes : viewModes.filter((mode) => mode.value !== 'all_time')

  return (
    <div className={cn('flex min-w-0 max-w-full flex-wrap items-center gap-3', className)}>
      {/* View Mode Toggle */}
      <div className="ledger-control flex w-full min-w-0 max-w-full flex-wrap gap-1 rounded-lg border p-1 sm:w-auto" role="tablist" aria-label="Period view mode">
        {availableModes.map((mode) => (
          <motion.button
            key={mode.value}
            type="button"
            role="tab"
            aria-selected={viewMode === mode.value}
            onClick={() => onViewModeChange(mode.value)}
            className={cn(
              'relative isolate min-h-11 min-w-11 flex-auto touch-manipulation rounded-md px-3 py-1.5 text-center text-sm font-medium leading-5 whitespace-nowrap sm:flex-none lg:pointer-fine:min-h-9',
              'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              viewMode === mode.value
                ? 'text-primary'
                : 'text-muted-foreground hover:bg-[var(--overlay-2)] hover:text-foreground'
            )}
            whileTap={reduceMotion ? undefined : TAP_FEEDBACK}
            transition={transition}
          >
            {viewMode === mode.value && (
              <motion.span
                aria-hidden="true"
                layoutId={reduceMotion ? undefined : activeId}
                initial={false}
                transition={transition}
                className="pointer-events-none absolute inset-0 rounded-md border border-primary/20 bg-primary/10"
              />
            )}
            <span className="relative">{mode.label}</span>
          </motion.button>
        ))}
      </div>

      {/* Period Navigation */}
      {canNavigate && viewMode !== 'all_time' && (
        <div className="ledger-control flex w-full min-w-0 max-w-full items-center gap-1 rounded-lg border p-1 sm:w-auto">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onPrevious}
            className="shrink-0 p-0 text-text-tertiary"
            aria-label="Previous period"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Button>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-2 py-1.5 sm:min-w-36">
            <Calendar aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span aria-live="polite" aria-atomic="true" className="min-w-0 text-center text-sm font-medium leading-5 text-foreground tabular-nums [overflow-wrap:anywhere]">
              <motion.span
                key={periodLabel}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={transition}
                className="block"
              >
                {periodLabel}
              </motion.span>
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onNext}
            className="shrink-0 p-0 text-text-tertiary"
            aria-label="Next period"
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  )
})
