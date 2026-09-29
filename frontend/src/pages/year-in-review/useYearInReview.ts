import { useMemo, useState } from 'react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { useDataDateBounds } from '@/hooks/api/useAnalytics'
import { useDailySummaries } from '@/hooks/api/useAnalyticsV2'
import { usePreferences } from '@/hooks/api/usePreferences'
import { usePreferencesStore } from '@/store/preferencesStore'
import { getCurrentFY, getCurrentMonth, getCurrentYear, MONTHS_PER_YEAR, toLocalDateKey, type AnalyticsViewMode } from '@/lib/dateUtils'
import { savingsRatePercentOr } from '@/lib/savingsRate'
import type { DayCell } from './components/DayOfWeekChart'
import {
  accumulateStats,
  aggregateDayTotals,
  aggregateFromDailySummaries,
  bestWorstMonths,
  buildDayCells,
  deriveMonthLabels,
  periodMonthOrder,
} from './heatmapUtils'
import { MONTHS_SHORT, type HeatmapMode } from './types'

export function useYearInReview() {
  const transactionsQuery = useTransactions()
  const dailySummariesQuery = useDailySummaries()
  const preferencesQuery = usePreferences()

  const { data: transactions = [] } = transactionsQuery
  const { data: dailySummaries = [] } = dailySummariesQuery
  const { data: preferences } = preferencesQuery
  const isLoading =
    transactionsQuery.isPending ||
    dailySummariesQuery.isPending ||
    preferencesQuery.isPending
  const isError =
    transactionsQuery.isError ||
    dailySummariesQuery.isError ||
    preferencesQuery.isError
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4
  const { displayPreferences } = usePreferencesStore()

  const [mode, setMode] = useState<HeatmapMode>('expense')
  const [hoveredDay, setHoveredDay] = useState<DayCell | null>(null)

  const prefMode = displayPreferences.defaultTimeRange as AnalyticsViewMode
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
  const dataDateRange = useDataDateBounds()

  const selectedYear = useMemo(() => {
    if (viewMode === 'fy') {
      const match = /FY\s?(\d{4})-(\d{2})/.exec(currentFY)
      return match ? Number.parseInt(match[1]) : currentYear
    }
    return currentYear
  }, [viewMode, currentYear, currentFY])
  const isFYMode = viewMode === 'fy'

  const { grid, maxExpense, maxIncome, maxNet, monthLabels } = useMemo(() => {
    const startDate = isFYMode
      ? new Date(selectedYear, fiscalYearStartMonth - 1, 1)
      : new Date(selectedYear, 0, 1)
    const endDate = isFYMode
      ? new Date(selectedYear + 1, fiscalYearStartMonth - 1, 0)
      : new Date(selectedYear, 11, 31)

    // Local-component keys: startDate/endDate are built from local components
    // (new Date(year, ...)), so toISOString() would roll them back a day in IST
    // and drop the boundary day's transactions from the range filter.
    const startStr = toLocalDateKey(startDate)
    const endStr = toLocalDateKey(endDate)

    const summaryDates = dailySummaries.map((s) => s.date).sort((a, b) => a.localeCompare(b))
    const hasCoverage =
      summaryDates.length > 0 &&
      summaryDates[0] <= startStr &&
      summaryDates[summaryDates.length - 1] >= endStr

    const { dayExpenses, dayIncomes } = hasCoverage
      ? aggregateFromDailySummaries(dailySummaries, startStr, endStr)
      : aggregateDayTotals(transactions, startStr, endStr)

    const { cells, mxE, mxI, mxN } = buildDayCells(startDate, endDate, dayExpenses, dayIncomes)
    const labels = deriveMonthLabels(cells)

    return { grid: cells, maxExpense: mxE, maxIncome: mxI, maxNet: mxN, monthLabels: labels }
  }, [dailySummaries, transactions, selectedYear, isFYMode, fiscalYearStartMonth])

  const modeMaxMap: Record<HeatmapMode, number> = {
    expense: maxExpense,
    income: maxIncome,
    net: maxNet,
  }
  const modeMax = modeMaxMap[mode]

  const stats = useMemo(() => {
    const acc = accumulateStats(grid)
    const { totalExpense, totalIncome, elapsedDays, monthlyExpense } = acc

    // The month holding today is still in progress, so it cannot be ranked
    // against complete months.
    const inProgressMonth = grid.find((cell) => cell.isToday)?.month ?? null
    const { best: bestMonth, worst: worstMonth } = bestWorstMonths(monthlyExpense, inProgressMonth)
    // Per elapsed day, not per spending day: dividing by days WITH spending
    // skipped every zero-spend day and overstated the average.
    const dailyAvg = elapsedDays > 0 ? totalExpense / elapsedDays : 0

    return {
      ...acc,
      totalSavings: totalIncome - totalExpense,
      savingsRate: savingsRatePercentOr({ income: totalIncome, expense: totalExpense }),
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
        // Net cash flow per month (positive = saved, negative = overspent).
        // Used to drive the overlay line on the Monthly Breakdown chart so
        // savings months stand out without the user doing the math.
        Net: earning - spending,
      }
    })
  }, [stats, isFYMode, selectedYear, fiscalYearStartMonth])

  const retry = () => {
    const retries: Array<Promise<unknown>> = []
    if (transactionsQuery.isError) retries.push(transactionsQuery.refetch())
    if (dailySummariesQuery.isError) retries.push(dailySummariesQuery.refetch())
    if (preferencesQuery.isError) retries.push(preferencesQuery.refetch())
    void Promise.all(retries)
  }

  return {
    transactions,
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
