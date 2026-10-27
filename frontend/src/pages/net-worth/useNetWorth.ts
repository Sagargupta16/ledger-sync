import { useCallback, useMemo, useState } from 'react'

import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'
import { dropPartialMonth, getLedgerTodayKey } from '@/lib/dateUtils'
import { averageMonthlySavings, totalsByMonth } from '@/lib/finance/monthlyAverage'
import {
  buildMonthlyNetWorthBalances,
  computeNetWorthTimeSeries,
  growthStatsFromMonthlySavings,
  summarizeNetWorthAccounts,
  type NetWorthPoint,
} from '@/lib/finance/netWorth'

import { buildNetWorthChartData, toNetWorthPoints } from './netWorthChartData'
import { measureSavingsGrowth } from './netWorthCompound'
import { summarizeMonthOverMonth } from './netWorthMoM'
import {
  buildMilestoneRows,
  DEFAULT_MILESTONES,
  DEFAULT_UPCOMING_WINDOW,
} from './netWorthProjection'
import {
  NON_ASSET_CATEGORIES,
  resolveAccountCategory,
  resolveAccountType,
} from './netWorthUtils'
import { useNetWorthSources } from './useNetWorthSources'

export function useNetWorth() {
  // One "today" for the hero and the trend: the ledger's own IST calendar day.
  const ledgerToday = getLedgerTodayKey()
  const {
    isLoading,
    isError,
    retry,
    accounts,
    dailyCashFlow,
    dateBounds,
    classifications,
    investmentMappings,
  } = useNetWorthSources(ledgerToday)
  const [showStacked, setShowStacked] = useState(false)
  const [showProjection, setShowProjection] = useState(false)
  const [expandedAssetCategories, setExpandedAssetCategories] = useState<Set<string>>(new Set())
  const [expandedLiabilityCategories, setExpandedLiabilityCategories] = useState<Set<string>>(
    new Set(),
  )

  const { dateRange, partialPeriod, timeFilterProps } = useAnalyticsTimeFilter(dateBounds, {
    defaultViewMode: 'all_time',
  })

  const getAccountType = useCallback(
    (accountName: string): string =>
      resolveAccountType(accountName, classifications, investmentMappings),
    [classifications, investmentMappings],
  )

  const categorizeAccount = useCallback(
    (accountName: string) => resolveAccountCategory(accountName, classifications, investmentMappings),
    [classifications, investmentMappings],
  )

  const {
    totalAssets,
    totalLiabilities,
    netWorth,
    assetCategories: allCategories,
    categoryProportions,
  } = useMemo(
    () =>
      summarizeNetWorthAccounts(
        Object.entries(accounts).map(([name, data]) => ({
          category: categorizeAccount(name),
          balance: data.balance,
        })),
        NON_ASSET_CATEGORIES,
      ),
    [accounts, categorizeAccount],
  )

  /**
   * Daily cumulative net worth, with future-dated rows cut off.
   *
   * The ledger legitimately carries forward-dated accruals (the real workbook
   * has an EPF contribution booked 2026-07-31 while today is 2026-07-26). Left
   * in, the cumulative series gained a point five days ahead of today, so the
   * chart drew its "Now" marker in the future, the last trend point showed money
   * not yet received, and the growth model's most recent monthly delta was taken
   * from a partly-future month. This is a HISTORICAL series, so it stops at
   * today (the same ledger day useNetWorthSources reads the balances at); the
   * projection overlay builds its own future points from the anchor.
   */
  const netWorthData = useMemo(
    () =>
      computeNetWorthTimeSeries(dailyCashFlow, allCategories, categoryProportions)
        .filter((point) => String(point.date) <= ledgerToday),
    [dailyCashFlow, allCategories, categoryProportions, ledgerToday],
  )

  const filteredNetWorthData = useMemo(() => {
    const startDate = dateRange.start_date
    if (!startDate) return netWorthData
    return netWorthData.filter((item) => {
      const d = item.date as string
      return d >= startDate && (!dateRange.end_date || d <= dateRange.end_date)
    })
  }, [netWorthData, dateRange])

  const chartSeries = useMemo(() => toNetWorthPoints(filteredNetWorthData), [filteredNetWorthData])
  const fullSeries = useMemo(() => toNetWorthPoints(netWorthData), [netWorthData])

  const anchor: NetWorthPoint | null = useMemo(
    () => chartSeries.at(-1) ?? null,
    [chartSeries],
  )

  const monthEndSeries = useMemo(
    () => buildMonthlyNetWorthBalances(chartSeries),
    [chartSeries],
  )

  // Fill inactive months before excluding the current partial month so a gap
  // before today's last observation still contributes complete calendar months.
  const completeMonthSeries: NetWorthPoint[] = useMemo(
    () => dropPartialMonth(monthEndSeries, 'date'),
    [monthEndSeries],
  )

  const monthlyNet = useMemo(
    () => totalsByMonth(filteredNetWorthData, (point) => String(point.date), (point) => Number(point.dailyFlow)),
    [filteredNetWorthData],
  )

  /**
   * Growth is the shared average monthly savings: net cash flow over the
   * trailing 12 complete calendar months of the selected window, empty months
   * as zero and the month in progress excluded. The Goals page divides by the
   * same months, so both pages quote one "/mo" figure for the same ledger.
   */
  const growthStats = useMemo(
    () =>
      growthStatsFromMonthlySavings(
        averageMonthlySavings(monthlyNet, { start: dateRange.start_date, end: dateRange.end_date }),
      ),
    [monthlyNet, dateRange],
  )
  const monthlyGrowth = growthStats.growth

  // How fast that saving itself has grown: the CAGR of yearly savings, which
  // the projection and the milestone ETAs compound the monthly saving at.
  const savingsGrowth = useMemo(
    () => measureSavingsGrowth(monthlyNet, { start: dateRange.start_date, end: dateRange.end_date }),
    [monthlyNet, dateRange],
  )

  const milestoneRows = useMemo(
    () => buildMilestoneRows(
      fullSeries, anchor, monthlyGrowth, DEFAULT_MILESTONES, DEFAULT_UPCOMING_WINDOW, savingsGrowth.rate,
    ),
    [fullSeries, anchor, monthlyGrowth, savingsGrowth.rate],
  )

  const chartData = useMemo(
    () => buildNetWorthChartData({
      showProjection,
      anchor,
      monthlyGrowth,
      sigma: growthStats.sigma,
      annualGrowth: savingsGrowth.rate,
      chartSeries,
      monthEndSeries,
      filteredNetWorthData,
    }),
    [showProjection, anchor, monthlyGrowth, growthStats.sigma, savingsGrowth.rate, chartSeries, monthEndSeries, filteredNetWorthData],
  )

  const currentNetWorth = anchor?.netWorth ?? 0

  // The badge and sparkline share the completed calendar-month balance series.
  const monthOverMonth = useMemo(() => summarizeMonthOverMonth(completeMonthSeries), [completeMonthSeries])

  // Account counts for the asset/liability KPI subtitles (point-in-time
  // balances have no truthful historical series client-side, so those two
  // cards get a count + leverage context line instead of a fake trend).
  const assetAccountCount = useMemo(
    () => Object.values(accounts).filter((acc) => acc.balance > 0.01).length,
    [accounts],
  )
  const liabilityAccountCount = useMemo(
    () => Object.values(accounts).filter((acc) => acc.balance < -0.01).length,
    [accounts],
  )

  const toggleCategory = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    category: string,
  ) => {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  return {
    isLoading,
    isError,
    retry,
    accounts,
    totalAssets,
    totalLiabilities,
    netWorth,
    allCategories,
    chartData,
    filteredNetWorthData,
    showStacked,
    setShowStacked,
    showProjection,
    setShowProjection,
    monthlyGrowth,
    savingsGrowth,
    anchor,
    milestoneRows,
    currentNetWorth,
    netWorthSparkline: monthOverMonth.sparkline,
    netWorthMoMChange: monthOverMonth.change,
    netWorthMoMLabel: monthOverMonth.label,
    partialPeriod,
    assetAccountCount,
    liabilityAccountCount,
    expandedAssetCategories,
    setExpandedAssetCategories,
    expandedLiabilityCategories,
    setExpandedLiabilityCategories,
    timeFilterProps,
    getAccountType,
    toggleCategory,
  }
}
