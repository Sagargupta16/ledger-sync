import { useState, useMemo } from 'react'
import { usePreferences } from '@/hooks/api/usePreferences'
import { usePreferencesStore } from '@/store/preferencesStore'
import {
  getCurrentYear,
  getCurrentMonth,
  getCurrentFY,
  getAnalyticsDateRange,
  type AnalyticsViewMode,
} from '@/lib/dateUtils'

interface UseAnalyticsTimeFilterOptions {
  defaultViewMode?: AnalyticsViewMode
  availableModes?: AnalyticsViewMode[]
}

/**
 * Shared hook that encapsulates the duplicated time-filter state management
 * used across all analytics pages.
 *
 * Handles:
 * - Reading the user's default time range from preferences
 * - Managing viewMode / year / month / FY state
 * - Computing the analytics date range from the current state
 * - Computing the data date range (min/max) from a transactions array
 * - Producing a spread-ready `timeFilterProps` object for `<AnalyticsTimeFilter>`
 */
export function useAnalyticsTimeFilter(
  transactions: Array<{ date: string }> | undefined,
  options?: UseAnalyticsTimeFilterOptions,
) {
  const { data: preferences } = usePreferences()
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4
  const { displayPreferences } = usePreferencesStore()

  const defaultMode =
    options?.defaultViewMode ??
    ((displayPreferences.defaultTimeRange as AnalyticsViewMode) || 'fy')

  const [viewMode, setViewMode] = useState<AnalyticsViewMode>(defaultMode)
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [currentFY, setCurrentFY] = useState(getCurrentFY(fiscalYearStartMonth))

  const dateRange = useMemo(
    () =>
      getAnalyticsDateRange(
        viewMode,
        currentYear,
        currentMonth,
        currentFY,
        fiscalYearStartMonth,
      ),
    [viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth],
  )

  const dataDateRange = useMemo(() => {
    if (!transactions || transactions.length === 0)
      return { minDate: undefined, maxDate: undefined }
    const dates = transactions.map((t) => t.date.substring(0, 10)).sort()
    return { minDate: dates[0], maxDate: dates[dates.length - 1] }
  }, [transactions])

  const timeFilterProps = {
    viewMode,
    onViewModeChange: setViewMode,
    currentYear,
    currentMonth,
    currentFY,
    onYearChange: setCurrentYear,
    onMonthChange: setCurrentMonth,
    onFYChange: setCurrentFY,
    minDate: dataDateRange.minDate,
    maxDate: dataDateRange.maxDate,
    fiscalYearStartMonth,
    ...(options?.availableModes
      ? { availableModes: options.availableModes }
      : {}),
  }

  return {
    viewMode,
    setViewMode,
    currentYear,
    setCurrentYear,
    currentMonth,
    setCurrentMonth,
    currentFY,
    setCurrentFY,
    fiscalYearStartMonth,
    dateRange,
    dataDateRange,
    timeFilterProps,
  }
}
