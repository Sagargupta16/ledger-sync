import { useState } from 'react'
import { getCurrentYear, getCurrentMonth } from '@/lib/dateUtils'

export type { ViewMode } from '@/lib/dateUtils'

export function useTimeNavigation(initialMode: ViewMode = 'yearly') {
  const [viewMode, setViewMode] = useState<ViewMode>(initialMode)
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())

  const handlePrevYear = () => setCurrentYear((prev) => prev - 1)
  const handleNextYear = () => setCurrentYear((prev) => prev + 1)

  const navigateMonth = (offset: number) => {
    const date = new Date(currentMonth + '-01')
    date.setMonth(date.getMonth() + offset)
    setCurrentMonth(date.toISOString().substring(0, 7))
  }

  const handlePrevMonth = () => navigateMonth(-1)
  const handleNextMonth = () => navigateMonth(1)

  return {
    viewMode,
    setViewMode,
    currentYear,
    currentMonth,
    handlePrevYear,
    handleNextYear,
    handlePrevMonth,
    handleNextMonth,
  }
}
