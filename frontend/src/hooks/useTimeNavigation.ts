import { useState } from 'react'
import { getCurrentYear, getCurrentMonth } from '@/lib/dateUtils'

export type { ViewMode } from '@/lib/dateUtils'

export function useTimeNavigation(initialMode: ViewMode = 'yearly') {
  const [viewMode, setViewMode] = useState<ViewMode>(initialMode)
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())

  const handlePrevYear = () => setCurrentYear((prev) => prev - 1)
  const handleNextYear = () => setCurrentYear((prev) => prev + 1)

  const handlePrevMonth = () => {
    const date = new Date(currentMonth + '-01')
    date.setMonth(date.getMonth() - 1)
    setCurrentMonth(date.toISOString().substring(0, 7))
  }

  const handleNextMonth = () => {
    const date = new Date(currentMonth + '-01')
    date.setMonth(date.getMonth() + 1)
    setCurrentMonth(date.toISOString().substring(0, 7))
  }

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
