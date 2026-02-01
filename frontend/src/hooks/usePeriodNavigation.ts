import { useState, useCallback } from 'react'
import { 
  ViewMode, 
  getCurrentYear, 
  getCurrentMonth, 
  getPreviousPeriod, 
  getNextPeriod, 
  getPeriodLabel,
  getDateRange,
  type DateRange 
} from '@/lib/dateUtils'

interface UsePeriodNavigationReturn {
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  currentYear: number
  currentMonth: string
  periodLabel: string
  dateRange: DateRange | null
  goToPrevious: () => void
  goToNext: () => void
  canNavigate: boolean
}

/**
 * Hook for managing period navigation (month/year/all-time)
 * Used across analytics components for consistent date filtering
 */
export function usePeriodNavigation(
  initialMode: ViewMode = 'yearly'
): UsePeriodNavigationReturn {
  const [viewMode, setViewMode] = useState<ViewMode>(initialMode)
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())

  const goToPrevious = useCallback(() => {
    const { year, month } = getPreviousPeriod(viewMode, currentYear, currentMonth)
    if (viewMode === 'yearly') {
      setCurrentYear(year)
    } else {
      setCurrentMonth(month)
    }
  }, [viewMode, currentYear, currentMonth])

  const goToNext = useCallback(() => {
    const { year, month } = getNextPeriod(viewMode, currentYear, currentMonth)
    if (viewMode === 'yearly') {
      setCurrentYear(year)
    } else {
      setCurrentMonth(month)
    }
  }, [viewMode, currentYear, currentMonth])

  const periodLabel = getPeriodLabel(viewMode, currentYear, currentMonth)
  const dateRange = getDateRange(viewMode, currentYear, currentMonth)
  const canNavigate = viewMode !== 'all_time'

  return {
    viewMode,
    setViewMode,
    currentYear,
    currentMonth,
    periodLabel,
    dateRange,
    goToPrevious,
    goToNext,
    canNavigate,
  }
}
