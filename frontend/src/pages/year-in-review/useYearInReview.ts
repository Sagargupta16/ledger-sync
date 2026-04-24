import { useMemo, useState } from 'react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { useDailySummaries } from '@/hooks/api/useAnalyticsV2'
import { usePreferences } from '@/hooks/api/usePreferences'
import { usePreferencesStore } from '@/store/preferencesStore'
import { getCurrentFY, getCurrentMonth, getCurrentYear, type AnalyticsViewMode } from '@/lib/dateUtils'
import type { DayCell } from './components/DayOfWeekChart'
import {
  accumulateStats,
  aggregateDayTotals,
  aggregateFromDailySummaries,
  buildDayCells,
  deriveMonthLabels,
} from './heatmapUtils'
import { MONTHS_SHORT, type HeatmapMode } from './types'

export function useYearInReview() {
  const { data: transactions = [] } = useTransactions()
  const { data: dailySummaries = [] } = useDailySummaries()
  const { data: preferences } = usePreferences()
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4
  const { displayPreferences } = usePreferencesStore()

  const [mode, setMode] = useState<HeatmapMode>('expense')
  const [hoveredDay, setHoveredDay] = useState<DayCell | null>(null)

  const prefMode = displayPreferences.defaultTimeRange as AnalyticsViewMode
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>(prefMode === 'fy' ? 'fy' : 'yearly')
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [currentFY, setCurrentFY] = useState(getCurrentFY(fiscalYearStartMonth))

  const dataDateRange = useMemo(() => {
    if (transactions.length === 0) return { minDate: undefined, maxDate: undefined }
    const dates = transactions.map((t) => t.date.substring(0, 10)).sort()
    return { minDate: dates[0], maxDate: dates[dates.length - 1] }
  }, [transactions])

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

    const startStr = startDate.toISOString().substring(0, 10)
    const endStr = endDate.toISOString().substring(0, 10)

    const summaryDates = dailySummaries.map((s) => s.date).sort()
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
    const { totalExpense, totalIncome, daysWithExpense, monthlyExpense } = acc

    const bestMonth = monthlyExpense.indexOf(Math.min(...monthlyExpense.filter((e) => e > 0)))
    const worstMonth = monthlyExpense.indexOf(Math.max(...monthlyExpense))
    const dailyAvg = daysWithExpense > 0 ? totalExpense / daysWithExpense : 0

    return {
      ...acc,
      totalSavings: totalIncome - totalExpense,
      savingsRate: totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0,
      dailyAvg,
      bestMonth: bestMonth >= 0 ? MONTHS_SHORT[bestMonth] : 'N/A',
      worstMonth: worstMonth >= 0 ? MONTHS_SHORT[worstMonth] : 'N/A',
    }
  }, [grid])

  const monthlyBarData = useMemo(
    () =>
      MONTHS_SHORT.map((m, i) => ({
        name: m,
        Spending: stats.monthlyExpense[i],
        Earning: stats.monthlyIncome[i],
      })),
    [stats],
  )

  return {
    transactions,
    mode,
    setMode,
    hoveredDay,
    setHoveredDay,
    viewMode,
    setViewMode,
    currentYear,
    setCurrentYear,
    currentMonth,
    setCurrentMonth,
    currentFY,
    setCurrentFY,
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
