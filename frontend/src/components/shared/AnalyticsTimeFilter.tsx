import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { rawColors } from '@/constants/colors'
import { useMemo } from 'react'
export type { AnalyticsViewMode } from '@/lib/dateUtils'
import { type AnalyticsViewMode, getFYFromDate } from '@/lib/dateUtils'

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
}: AnalyticsTimeFilterProps) {
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
        const prevDate = new Date(currentMonth + '-01')
        prevDate.setMonth(prevDate.getMonth() - 1)
        onMonthChange(prevDate.toISOString().substring(0, 7))
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
        const nextDate = new Date(currentMonth + '-01')
        nextDate.setMonth(nextDate.getMonth() + 1)
        onMonthChange(nextDate.toISOString().substring(0, 7))
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
    <div className="flex flex-col sm:flex-row items-center gap-4">
      {/* Period Navigation — LEFT of the mode selector */}
      {showNavigation && (
        <div className="flex items-center gap-2">
          <motion.button
            onClick={handlePrevious}
            disabled={!canGoPrev}
            className="p-2 rounded-lg glass-thin hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            whileTap={canGoPrev ? { scale: 0.95 } : undefined}
            aria-label="Previous period"
          >
            <ChevronLeft className="w-4 h-4" />
          </motion.button>

          <span className="text-white font-medium min-w-36 text-center">
            {periodLabel}
          </span>

          <motion.button
            onClick={handleNext}
            disabled={!canGoNext}
            className="p-2 rounded-lg glass-thin hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            whileTap={canGoNext ? { scale: 0.95 } : undefined}
            aria-label="Next period"
          >
            <ChevronRight className="w-4 h-4" />
          </motion.button>
        </div>
      )}

      {/* View Mode Selector */}
      <div className="flex items-center gap-1 p-1 glass-thin rounded-xl" role="tablist">
        {viewModes.map((mode) => (
          <motion.button
            key={mode.value}
            role="tab"
            aria-selected={viewMode === mode.value}
            onClick={() => onViewModeChange(mode.value)}
            className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              viewMode === mode.value
                ? 'text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
            whileTap={{ scale: 0.97 }}
          >
            {viewMode === mode.value && (
              <motion.div
                layoutId="analyticsActiveTab"
                className="absolute inset-0 rounded-lg"
                style={{ backgroundColor: rawColors.ios.blue }}
                initial={false}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative z-10">{mode.label}</span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
