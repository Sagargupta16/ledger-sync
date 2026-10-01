import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDataDateRange } from '@/hooks/api/useAnalytics'
import { analyticsV2Keys, useDailySummaries } from '@/hooks/api/useAnalyticsV2'
import { usePreferences } from '@/hooks/api/usePreferences'
import { usePreferencesStore } from '@/store/preferencesStore'
import { parseFYLabelStartYear } from '@/lib/dateRanges'
import { getCurrentFY, getCurrentMonth, getCurrentYear, MONTHS_PER_YEAR, toLocalDateKey, type AnalyticsViewMode } from '@/lib/dateUtils'
import { savingsRatePercentFromNet } from '@/lib/savingsRate'
import { analyticsV2Service } from '@/services/api/analyticsV2'
import type { DayCell } from './components/DayOfWeekChart'
import {
  accumulateStats,
  aggregateFromDailySummaries,
  bestWorstMonths,
  buildDayCells,
  deriveMonthLabels,
  periodMonthOrder,
} from './heatmapUtils'
import { MONTHS_SHORT, type HeatmapMode } from './types'

/** Largest page `/analytics/v2/daily-summaries` accepts (`Query(le=3000)`). */
const MAX_DAILY_SUMMARY_ROWS = 3000

/**
 * Year in Review reads server rollups only: `/data-date-range` for the bounds
 * and the empty state, and `/analytics/v2/daily-summaries` for the heatmap,
 * stats and monthly bars of the selected year.
 *
 * It used to download the full ledger as a fallback and rebuild the day totals
 * client-side whenever the daily rollups did not span the whole window, which
 * for the current year was always (the window ends on Dec 31, the rollups on
 * the last transaction). The two paths could not agree once a realised loss
 * was classified: the rollups keep a classified loss out of `expense` and
 * subtract it from `net`, the client path decided losses from name patterns.
 * Days absent from the rollup are days with no transaction at all, so the
 * rollup alone is the complete answer.
 */
export function useYearInReview() {
  const preferencesQuery = usePreferences()
  const dateRangeQuery = useDataDateRange()

  const { data: preferences } = preferencesQuery
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4
  const defaultTimeRange = usePreferencesStore((state) => state.displayPreferences.defaultTimeRange)

  const [mode, setMode] = useState<HeatmapMode>('expense')
  const [hoveredDay, setHoveredDay] = useState<DayCell | null>(null)

  const prefMode = defaultTimeRange as AnalyticsViewMode
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>(prefMode === 'fy' ? 'fy' : 'yearly')
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [currentFY, setCurrentFY] = useState(getCurrentFY(fiscalYearStartMonth))

  // currentFY is seeded once from the default start month (4) before
  // /api/preferences resolves, and useState initializers never re-run, so a
  // non-April fiscal year stayed on the April window. Resync during render when
  // preferences arrive -- the same pattern as useAnalyticsTimeFilter -- but only
  // until the user picks a period, so a deliberate choice is never overwritten.
  const [userInteracted, setUserInteracted] = useState(false)
  const [syncedFsm, setSyncedFsm] = useState<number | null>(null)
  if (preferences && !userInteracted && syncedFsm !== fiscalYearStartMonth) {
    setSyncedFsm(fiscalYearStartMonth)
    setCurrentFY(getCurrentFY(fiscalYearStartMonth))
  }
  const markInteracted = <T,>(setter: (v: T) => void) => (v: T) => {
    setUserInteracted(true)
    setter(v)
  }

  // Bounds from /data-date-range: same non-deleted, non-excluded rows as the
  // ledger, without sorting every row's date on the client.
  const { minDate, maxDate } = dateRangeQuery
  const dataDateRange = useMemo(() => ({ minDate, maxDate }), [minDate, maxDate])

  // `parseFYLabelStartYear` reads both label forms. The old `FY\s?(\d{4})-(\d{2})`
  // regex required the two-year form, so a January-start FY ("FY 2024") never
  // matched and the FY view silently fell back to the calendar year.
  const selectedYear = useMemo(() => {
    if (viewMode === 'fy') return parseFYLabelStartYear(currentFY) ?? currentYear
    return currentYear
  }, [viewMode, currentYear, currentFY])
  const isFYMode = viewMode === 'fy'

  const period = useMemo(() => {
    const startDate = isFYMode
      ? new Date(selectedYear, fiscalYearStartMonth - 1, 1)
      : new Date(selectedYear, 0, 1)
    const endDate = isFYMode
      ? new Date(selectedYear + 1, fiscalYearStartMonth - 1, 0)
      : new Date(selectedYear, 11, 31)
    // Local-component keys: startDate/endDate are built from local components
    // (new Date(year, ...)), so toISOString() would roll them back a day in IST
    // and drop the boundary day from the window.
    return { startDate, endDate, startStr: toLocalDateKey(startDate), endStr: toLocalDateKey(endDate) }
  }, [selectedYear, isFYMode, fiscalYearStartMonth])

  // One request serves every year: the endpoint's largest page (3,000 stored
  // days, ~8 years of activity; the same request Quick Insights makes), so
  // stepping through years is instant, as it was on the full ledger. Only when
  // that page is full AND starts after the selected period -- a ledger longer
  // than the page -- is the period fetched on its own (at most 366 rows).
  const historyQuery = useDailySummaries({ limit: MAX_DAILY_SUMMARY_ROWS })
  const history = historyQuery.data
  const historyCovers =
    history !== undefined &&
    (history.length < MAX_DAILY_SUMMARY_ROWS || (history[0]?.date ?? '') <= period.startStr)
  const periodParams = { start_date: period.startStr, end_date: period.endStr }
  const periodQuery = useQuery({
    queryKey: analyticsV2Keys.dailySummaries(periodParams),
    queryFn: () => analyticsV2Service.getDailySummaries(periodParams),
    staleTime: Infinity,
    enabled: history !== undefined && !historyCovers,
  })
  const dailySummaries = historyCovers ? history : periodQuery.data
  const needsPeriodQuery = history !== undefined && !historyCovers

  const isLoading =
    dateRangeQuery.isLoading ||
    historyQuery.isPending ||
    (needsPeriodQuery && periodQuery.isPending) ||
    preferencesQuery.isPending
  const isError =
    dateRangeQuery.isError ||
    historyQuery.isError ||
    (needsPeriodQuery && periodQuery.isError) ||
    preferencesQuery.isError

  const { grid, maxExpense, maxIncome, maxNet, monthLabels } = useMemo(() => {
    const { dayExpenses, dayIncomes, dayNets } = aggregateFromDailySummaries(
      dailySummaries ?? [],
      period.startStr,
      period.endStr,
    )
    const { cells, mxE, mxI, mxN } = buildDayCells(
      period.startDate,
      period.endDate,
      dayExpenses,
      dayIncomes,
      dayNets,
    )
    const labels = deriveMonthLabels(cells)

    return { grid: cells, maxExpense: mxE, maxIncome: mxI, maxNet: mxN, monthLabels: labels }
  }, [dailySummaries, period])

  const modeMaxMap: Record<HeatmapMode, number> = {
    expense: maxExpense,
    income: maxIncome,
    net: maxNet,
  }
  const modeMax = modeMaxMap[mode]

  const stats = useMemo(() => {
    const acc = accumulateStats(grid)
    const { totalExpense, totalIncome, totalNet, elapsedDays, monthlyExpense } = acc

    // The month holding today is still in progress, so it cannot be ranked
    // against complete months.
    const inProgressMonth = grid.find((cell) => cell.isToday)?.month ?? null
    const { best: bestMonth, worst: worstMonth } = bestWorstMonths(monthlyExpense, inProgressMonth)
    // Per elapsed day, not per spending day: dividing by days WITH spending
    // skipped every zero-spend day and overstated the average.
    const dailyAvg = elapsedDays > 0 ? totalExpense / elapsedDays : 0

    // Savings = income - spending - classified realised losses: the rollup's
    // per-day `net` already subtracts the loss that `expense` holds out.
    // `totalIncome - totalExpense` put the loss back into savings.
    return {
      ...acc,
      totalSavings: totalNet,
      savingsRate: savingsRatePercentFromNet(totalNet, totalIncome) ?? 0,
      dailyAvg,
      bestMonth: bestMonth >= 0 ? MONTHS_SHORT[bestMonth] : 'N/A',
      worstMonth: worstMonth >= 0 ? MONTHS_SHORT[worstMonth] : 'N/A',
    }
  }, [grid])

  const monthlyBarData = useMemo(() => {
    const now = new Date()
    const nowYear = now.getFullYear()
    const nowMonth = now.getMonth()
    let cutoff = MONTHS_PER_YEAR
    if (isFYMode) {
      const fyStartYear = selectedYear
      const fyEndYear = selectedYear + 1
      const isCurrentFY =
        (nowYear === fyStartYear && nowMonth >= fiscalYearStartMonth - 1) ||
        (nowYear === fyEndYear && nowMonth < fiscalYearStartMonth - 1)
      if (isCurrentFY) {
        cutoff = ((nowMonth - (fiscalYearStartMonth - 1) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR) + 1
      }
    } else if (selectedYear === nowYear) {
      cutoff = nowMonth + 1
    }
    return periodMonthOrder(isFYMode, fiscalYearStartMonth).slice(0, cutoff).map((monthIndex) => {
      const spending = stats.monthlyExpense[monthIndex]
      const earning = stats.monthlyIncome[monthIndex]
      return {
        name: MONTHS_SHORT[monthIndex],
        Spending: spending,
        Earning: earning,
        // Net cash flow per month (positive = saved, negative = overspent),
        // after classified realised losses. Drives the overlay line on the
        // Monthly Breakdown chart so savings months stand out.
        Net: stats.monthlyNet[monthIndex],
      }
    })
  }, [stats, isFYMode, selectedYear, fiscalYearStartMonth])

  const retry = () => {
    const retries: Array<Promise<unknown>> = []
    if (dateRangeQuery.isError) retries.push(dateRangeQuery.refetch())
    if (historyQuery.isError) retries.push(historyQuery.refetch())
    if (needsPeriodQuery && periodQuery.isError) retries.push(periodQuery.refetch())
    if (preferencesQuery.isError) retries.push(preferencesQuery.refetch())
    void Promise.all(retries)
  }

  return {
    /** The ledger holds at least one row (drives the upload empty state). */
    hasData: Boolean(maxDate),
    isLoading,
    isError,
    retry,
    mode,
    setMode,
    hoveredDay,
    setHoveredDay,
    viewMode,
    setViewMode: markInteracted(setViewMode),
    currentYear,
    setCurrentYear: markInteracted(setCurrentYear),
    currentMonth,
    setCurrentMonth: markInteracted(setCurrentMonth),
    currentFY,
    setCurrentFY: markInteracted(setCurrentFY),
    dataDateRange,
    fiscalYearStartMonth,
    selectedYear,
    isFYMode,
    grid,
    modeMax,
    monthLabels,
    stats,
    monthlyBarData,
  }
}
