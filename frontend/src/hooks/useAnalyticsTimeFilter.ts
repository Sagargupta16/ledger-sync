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

/**
 * Clamp a nullable start-date to the earning-start preference when active.
 * This is the **view-layer** application of earning-start — charts visually
 * start at the earning date; underlying data is untouched.
 *
 * Exported for unit testing only.
 */
export function clampStartToEarningStart(
  startDate: string | null,
  earningStartDate: string | null,
  useEarningStartDate: boolean,
): string | null {
  if (!useEarningStartDate || !earningStartDate) return startDate
  const cutoff = earningStartDate.substring(0, 10)
  if (!startDate) return cutoff
  return startDate < cutoff ? cutoff : startDate
}

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
  const earningStartDate = usePreferencesStore((s) => s.earningStartDate)
  const useEarningStartDate = usePreferencesStore((s) => s.useEarningStartDate)

  const defaultMode =
    options?.defaultViewMode ??
    ((displayPreferences.defaultTimeRange as AnalyticsViewMode) || 'fy')

  const [viewMode, setViewMode] = useState<AnalyticsViewMode>(defaultMode)
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [currentFY, setCurrentFY] = useState(getCurrentFY(fiscalYearStartMonth))

  const dateRange = useMemo(() => {
    const raw = getAnalyticsDateRange(
      viewMode,
      currentYear,
      currentMonth,
      currentFY,
      fiscalYearStartMonth,
    )
    return {
      ...raw,
      start_date: clampStartToEarningStart(
        raw.start_date,
        earningStartDate,
        useEarningStartDate,
      ),
    }
  }, [
    viewMode,
    currentYear,
    currentMonth,
    currentFY,
    fiscalYearStartMonth,
    earningStartDate,
    useEarningStartDate,
  ])

  const dataDateRange = useMemo(() => {
    if (!transactions || transactions.length === 0)
      return { minDate: undefined, maxDate: undefined }
    const dates = transactions.map((t) => t.date.substring(0, 10)).sort((a, b) => a.localeCompare(b))
    const rawMin = dates[0]
    const clampedMin =
      clampStartToEarningStart(rawMin, earningStartDate, useEarningStartDate) ?? rawMin
    return { minDate: clampedMin, maxDate: dates.at(-1) }
  }, [transactions, earningStartDate, useEarningStartDate])

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
