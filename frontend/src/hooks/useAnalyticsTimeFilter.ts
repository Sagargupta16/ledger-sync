import { useMemo, useState } from 'react'
import { usePreferences } from '@/hooks/api/usePreferences'
import { usePreferencesStore } from '@/store/preferencesStore'
import {
  getCurrentYear,
  getCurrentMonth,
  getCurrentFY,
  getAnalyticsDateRange,
  resolvePartialPeriod,
  toCompleteMonthsRange,
  type AnalyticsViewMode,
  type PartialPeriod,
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
 * Whether a page has NO complete-month basis to compute its rates on.
 *
 * Two independent ways that happens, and a page must handle both identically:
 *  1. the range itself holds no complete month (`isRangePartialOnly`) -- the user
 *     selected the current month;
 *  2. the range holds a complete month but no ROWS survive the narrowing --
 *     a user one month into their history on the default all-time view, or a
 *     category deep-link whose transactions all fall in the month in progress.
 *
 * Case 2 was the gap: pages keyed their notice copy off the range-level flag
 * alone, so they claimed "completed months only" while every rate on screen was
 * 0 or blank. Feed the count of rows on the comparable basis in and use the
 * result BOTH for the notice wording and for whether to fall back to the raw
 * basis.
 */
export function hasNoCompleteMonthBasis(
  isRangePartialOnly: boolean,
  comparableRowCount: number,
): boolean {
  return isRangePartialOnly || comparableRowCount === 0
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
 * - Detecting an in-progress month in the selected window (`partialPeriod`) and
 *   offering a complete-months-only variant of the range (`comparableDateRange`)
 *   for the rate/average computations that a half-month corrupts. Pair
 *   `isRangePartialOnly` with `hasNoCompleteMonthBasis` and your own row count --
 *   the flag alone cannot see that a narrowed range came back empty.
 */
/** Either the legacy transactions array (min/max derived from it) or an
 * explicit ``{minDate, maxDate}`` bounds object (from the lightweight
 * ``/data-date-range`` endpoint -- no full-ledger fetch). */
export type TimeFilterDateSource =
  | Array<{ date: string }>
  | { minDate?: string; maxDate?: string }
  | undefined

function isBounds(src: TimeFilterDateSource): src is { minDate?: string; maxDate?: string } {
  return !!src && !Array.isArray(src)
}

export function useAnalyticsTimeFilter(
  transactions: TimeFilterDateSource,
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

  // The state above is seeded ONCE from defaults (fiscalYearStartMonth falls
  // back to 4) before /api/preferences resolves. useState initializers never
  // re-run, so a user with a non-April fiscal year would be stuck on the wrong
  // FY window until they touched the selector. When preferences arrive, adjust
  // the FY during render (React's "adjust state while rendering" pattern -- no
  // effect, no cascading render) -- but only until the user interacts, so we
  // never clobber a deliberate selection. All gates are state (not refs), so
  // the adjustment is a pure function of the current render.
  const [userInteracted, setUserInteracted] = useState(false)
  const [syncedFsm, setSyncedFsm] = useState<number | null>(null)
  if (preferences && !userInteracted && syncedFsm !== fiscalYearStartMonth) {
    setSyncedFsm(fiscalYearStartMonth)
    setCurrentFY(getCurrentFY(fiscalYearStartMonth))
    if (!options?.defaultViewMode && displayPreferences.defaultTimeRange) {
      setViewMode(displayPreferences.defaultTimeRange as AnalyticsViewMode)
    }
  }

  const markInteracted = <T,>(setter: (v: T) => void) => (v: T) => {
    setUserInteracted(true)
    setter(v)
  }

  const dateRange = useMemo(() => {
    const raw = getAnalyticsDateRange({
      viewMode,
      currentYear,
      currentMonth,
      currentFY,
      fiscalYearStartMonth,
    })
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

  /**
   * The in-progress month the selected window overlaps, or `null` when the
   * window is entirely in the past. Non-null means every per-month rate or
   * average derived from `dateRange` is mixing a 26-of-31-day month in with
   * complete ones -- the single defect class that made the real ledger report a
   * -986.2% monthly savings rate, a 1015.3% "essential share" and a false
   * net-worth dip (all three re-measured 2026-07-27 against the live workbook).
   */
  const partialPeriod = useMemo<PartialPeriod | null>(
    () => resolvePartialPeriod(dateRange),
    [dateRange],
  )

  /**
   * `dateRange` narrowed to end at the last COMPLETE month.
   *
   * Consume this for RATES and AVERAGES (savings rate, needs/wants share,
   * average monthly spend, MoM deltas, growth rates); keep consuming
   * `dateRange` for current-period TOTALS, which the user genuinely wants to
   * see mid-month. Whenever the two differ, render `PartialPeriodNotice` from
   * `partialPeriod` so a narrowed window is stated rather than silent.
   *
   * Falls back to `dateRange` when the selection holds no complete month (the
   * user picked the current month explicitly) -- there is nothing else to show,
   * and the notice carries the caveat.
   */
  const comparableDateRange = useMemo(
    () => toCompleteMonthsRange(dateRange) ?? dateRange,
    [dateRange],
  )

  /**
   * True when narrowing to complete months was IMPOSSIBLE for this range -- the
   * user explicitly selected the month in progress, so `comparableDateRange`
   * came back identical.
   *
   * This is a RANGE-level fact only. A range that DOES contain a complete month
   * can still hold zero rows once narrowed (a new user one month in on the
   * default all-time view, or a category deep-link whose rows all fall in the
   * current month), and a page that trusts this flag alone then reports its
   * rates as "completed months only" while every one of them is blank. Combine
   * it with your own row count via `hasNoCompleteMonthBasis` before deciding
   * what the notice says or which basis to compute on.
   */
  const isRangePartialOnly = comparableDateRange === dateRange && partialPeriod !== null

  const dataDateRange = useMemo(() => {
    // Explicit bounds (lightweight /data-date-range) take the fast path.
    let rawMin: string | undefined
    let rawMax: string | undefined
    if (isBounds(transactions)) {
      rawMin = transactions.minDate
      rawMax = transactions.maxDate
    } else if (transactions && transactions.length > 0) {
      const dates = transactions
        .map((t) => t.date.substring(0, 10))
        .sort((a, b) => a.localeCompare(b))
      rawMin = dates[0]
      rawMax = dates.at(-1)
    }
    if (!rawMin) return { minDate: undefined, maxDate: undefined }
    const clampedMin =
      clampStartToEarningStart(rawMin, earningStartDate, useEarningStartDate) ?? rawMin
    return { minDate: clampedMin, maxDate: rawMax }
  }, [transactions, earningStartDate, useEarningStartDate])

  const timeFilterProps = {
    viewMode,
    onViewModeChange: markInteracted(setViewMode),
    currentYear,
    currentMonth,
    currentFY,
    onYearChange: markInteracted(setCurrentYear),
    onMonthChange: markInteracted(setCurrentMonth),
    onFYChange: markInteracted(setCurrentFY),
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
    comparableDateRange,
    partialPeriod,
    isRangePartialOnly,
    dataDateRange,
    timeFilterProps,
  }
}
