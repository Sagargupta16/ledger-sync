import { useId, useMemo } from 'react'

import { motion } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { DURATION, EASING, TAP_FEEDBACK } from '@/constants/animations'
import { cn } from '@/lib/cn'
import { useMotionStore } from '@/store/motionStore'

export type { AnalyticsViewMode } from '@/lib/dateUtils'
import { type AnalyticsViewMode, getFYFromDate } from '@/lib/dateUtils'

/**
 * Shift a `YYYY-MM` key by `delta` months using integer arithmetic.
 *
 * Date-based math (new Date(key+'-01') is UTC midnight, setMonth() is local,
 * toISOString() is UTC) skips/sticks on months for non-UTC users. Integer math
 * on year/month is timezone-independent.
 */
function shiftMonth(yyyymm: string, delta: number): string {
  const [year, month] = yyyymm.split('-').map(Number)
  const zeroBased = year * 12 + (month - 1) + delta
  const newYear = Math.floor(zeroBased / 12)
  const newMonth = (zeroBased % 12) + 1
  return `${newYear}-${String(newMonth).padStart(2, '0')}`
}

interface AnalyticsTimeFilterProps {
  readonly viewMode: AnalyticsViewMode
  readonly onViewModeChange: (mode: AnalyticsViewMode) => void
  readonly currentYear: number
  readonly currentMonth: string
  readonly currentFY: string
  readonly onYearChange: (year: number) => void
  readonly onMonthChange: (month: string) => void
  readonly onFYChange: (fy: string) => void
  readonly minDate?: string // YYYY-MM-DD earliest transaction date
  readonly maxDate?: string // YYYY-MM-DD latest transaction date
  readonly fiscalYearStartMonth?: number
  readonly availableModes?: AnalyticsViewMode[]
}

const viewModes: { value: AnalyticsViewMode; label: string }[] = [
  { value: 'all_time', label: 'All Time' },
  { value: 'fy', label: 'FY' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'monthly', label: 'Monthly' },
]

/** Parse "FY 2024-25" → 2024 (the start year) */
const parseFYStartYear = (fy: string): number | null => {
  const match = /FY\s?(\d{4})-(\d{2})/.exec(fy)
  return match ? Number.parseInt(match[1]) : null
}

export default function AnalyticsTimeFilter({
  viewMode,
  onViewModeChange,
  currentYear,
  currentMonth,
  currentFY,
  onYearChange,
  onMonthChange,
  onFYChange,
  minDate,
  maxDate,
  fiscalYearStartMonth = 4,
  availableModes,
}: AnalyticsTimeFilterProps) {
  const activeId = useId()
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')
  const transition = { duration: reduceMotion ? 0 : DURATION.quick, ease: EASING.cinematic }

  // Filter view modes if availableModes is specified
  const filteredViewModes = availableModes
    ? viewModes.filter((m) => availableModes.includes(m.value))
    : viewModes
  // Compute boundaries from minDate/maxDate
  const boundaries = useMemo(() => {
    if (!minDate || !maxDate) return null

    const minD = new Date(minDate)
    const maxD = new Date(maxDate)

    const minYear = minD.getFullYear()
    const maxYear = maxD.getFullYear()
    const minMonth = minDate.substring(0, 7) // YYYY-MM
    const maxMonth = maxDate.substring(0, 7)

    const minFYStartYear = parseFYStartYear(getFYFromDate(minD, fiscalYearStartMonth))
    const maxFYStartYear = parseFYStartYear(getFYFromDate(maxD, fiscalYearStartMonth))

    return { minYear, maxYear, minMonth, maxMonth, minFYStartYear, maxFYStartYear }
  }, [minDate, maxDate, fiscalYearStartMonth])

  // Determine if prev/next are disabled
  const canGoPrev = useMemo(() => {
    if (!boundaries) return true // no boundaries = allow all
    switch (viewMode) {
      case 'yearly':
        return currentYear > boundaries.minYear
      case 'monthly':
        return currentMonth > boundaries.minMonth
      case 'fy': {
        const currentFYStart = parseFYStartYear(currentFY)
        return currentFYStart != null && boundaries.minFYStartYear != null && currentFYStart > boundaries.minFYStartYear
      }
      default:
        return true
    }
  }, [viewMode, currentYear, currentMonth, currentFY, boundaries])

  const canGoNext = useMemo(() => {
    if (!boundaries) return true
    switch (viewMode) {
      case 'yearly':
        return currentYear < boundaries.maxYear
      case 'monthly':
        return currentMonth < boundaries.maxMonth
      case 'fy': {
        const currentFYStart = parseFYStartYear(currentFY)
        return currentFYStart != null && boundaries.maxFYStartYear != null && currentFYStart < boundaries.maxFYStartYear
      }
      default:
        return true
    }
  }, [viewMode, currentYear, currentMonth, currentFY, boundaries])

  // Get display label based on view mode
  const periodLabel = useMemo(() => {
    switch (viewMode) {
      case 'all_time':
        return 'All Time'
      case 'fy':
        return currentFY
      case 'yearly':
        return String(currentYear)
      case 'monthly': {
        const date = new Date(currentMonth + '-01')
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      }
      default:
        return ''
    }
  }, [viewMode, currentYear, currentMonth, currentFY])

  // Navigation handlers
  const handlePrevious = () => {
    if (!canGoPrev) return
    switch (viewMode) {
      case 'yearly':
        onYearChange(currentYear - 1)
        break
      case 'monthly': {
        onMonthChange(shiftMonth(currentMonth, -1))
        break
      }
      case 'fy': {
        const fyRegex = /FY\s?(\d{4})-(\d{2})/
        const match = fyRegex.exec(currentFY)
        if (match) {
          const prevStartYear = Number.parseInt(match[1]) - 1
          onFYChange(`FY ${prevStartYear}-${String(prevStartYear + 1).slice(-2)}`)
        }
        break
      }
    }
  }

  const handleNext = () => {
    if (!canGoNext) return
    switch (viewMode) {
      case 'yearly':
        onYearChange(currentYear + 1)
        break
      case 'monthly': {
        onMonthChange(shiftMonth(currentMonth, 1))
        break
      }
      case 'fy': {
        const fyRegex = /FY\s?(\d{4})-(\d{2})/
        const match = fyRegex.exec(currentFY)
        if (match) {
          const nextStartYear = Number.parseInt(match[1]) + 1
          onFYChange(`FY ${nextStartYear}-${String(nextStartYear + 1).slice(-2)}`)
        }
        break
      }
    }
  }

  const showNavigation = viewMode !== 'all_time'

  return (
    <div className="flex min-w-0 max-w-full flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {/* Period Navigation -- LEFT of the mode selector */}
      {showNavigation && (
        <div className="ledger-control flex w-full min-w-0 max-w-full items-center gap-1 rounded-lg border p-1 sm:w-auto">
          <motion.button
            type="button"
            onClick={handlePrevious}
            disabled={!canGoPrev}
            className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-md text-text-tertiary enabled:hover:bg-[var(--overlay-2)] enabled:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-30 lg:pointer-fine:size-9"
            whileTap={canGoPrev && !reduceMotion ? TAP_FEEDBACK : undefined}
            transition={transition}
            title={canGoPrev ? 'Previous period' : 'Already at your earliest data'}
            aria-label="Previous period"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </motion.button>

          <span
            aria-live="polite"
            aria-atomic="true"
            className="min-w-0 flex-1 px-2 text-center text-sm font-medium leading-5 text-foreground tabular-nums [overflow-wrap:anywhere] sm:min-w-36"
          >
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

          <motion.button
            type="button"
            onClick={handleNext}
            disabled={!canGoNext}
            className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-md text-text-tertiary enabled:hover:bg-[var(--overlay-2)] enabled:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-30 lg:pointer-fine:size-9"
            whileTap={canGoNext && !reduceMotion ? TAP_FEEDBACK : undefined}
            transition={transition}
            title={canGoNext ? 'Next period' : 'Already at your latest data'}
            aria-label="Next period"
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </motion.button>
        </div>
      )}

      {/* View Mode Selector. Full-width on phone with wrapping options;
          auto-width inline control from sm+. */}
      <div className="ledger-control flex w-full min-w-0 max-w-full flex-wrap gap-1 rounded-lg border p-1 sm:w-auto" role="tablist" aria-label="Time range">
        {filteredViewModes.map((mode) => (
          <motion.button
            key={mode.value}
            type="button"
            role="tab"
            aria-selected={viewMode === mode.value}
            onClick={() => onViewModeChange(mode.value)}
            className={cn(
              'relative isolate min-h-11 min-w-11 flex-auto touch-manipulation rounded-md px-2 py-1.5 text-center text-sm font-medium leading-5 whitespace-nowrap sm:flex-none sm:px-3 lg:pointer-fine:min-h-9',
              'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              viewMode === mode.value
                ? 'text-primary'
                : 'text-muted-foreground hover:bg-[var(--overlay-2)] hover:text-foreground',
            )}
            whileTap={reduceMotion ? undefined : TAP_FEEDBACK}
            transition={transition}
          >
            {viewMode === mode.value && (
              <motion.span
                aria-hidden="true"
                layoutId={reduceMotion ? undefined : activeId}
                className="pointer-events-none absolute inset-0 rounded-md border border-primary/20 bg-primary/10"
                initial={false}
                transition={transition}
              />
            )}
            <span className="relative">{mode.label}</span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
