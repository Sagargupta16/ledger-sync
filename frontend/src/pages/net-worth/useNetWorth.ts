import { useCallback, useMemo, useState } from 'react'

import { useAccountBalances } from '@/hooks/api/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useAccountClassifications } from '@/hooks/api/useAccountClassifications'
import { capSeriesToToday, dropPartialMonth, formatMonthKey } from '@/lib/dateUtils'
import {
  buildMonthlyNetWorthBalances,
  computeLinearGrowthStats,
  computeNetWorthTimeSeries,
  projectNetWorthLinearBand,
  summarizeNetWorthAccounts,
  type NetWorthPoint,
} from '@/lib/finance/netWorth'

import {
  buildMilestoneRows,
  downsampleToMonthly,
} from './netWorthProjection'
import {
  NON_ASSET_CATEGORIES,
  resolveAccountCategory,
  resolveAccountType,
} from './netWorthUtils'

export function useNetWorth() {
  const balancesQuery = useAccountBalances()
  const transactionsQuery = useTransactions()
  const preferencesQuery = usePreferences()
  const classificationsQuery = useAccountClassifications()
  const balanceData = balancesQuery.data
  const transactions = useMemo(
    () => transactionsQuery.data ?? [],
    [transactionsQuery.data],
  )
  const preferences = preferencesQuery.data
  const classifications = useMemo(
    () => classificationsQuery.data ?? {},
    [classificationsQuery.data],
  )
  const [showStacked, setShowStacked] = useState(false)
  const [showProjection, setShowProjection] = useState(false)
  const [expandedAssetCategories, setExpandedAssetCategories] = useState<Set<string>>(new Set())
  const [expandedLiabilityCategories, setExpandedLiabilityCategories] = useState<Set<string>>(
    new Set(),
  )

  const { dateRange, partialPeriod, timeFilterProps } = useAnalyticsTimeFilter(transactions, {
    defaultViewMode: 'all_time',
  })

  const isLoading =
    balancesQuery.isLoading ||
    transactionsQuery.isLoading ||
    preferencesQuery.isLoading ||
    classificationsQuery.isLoading
  const isError =
    balancesQuery.isError ||
    transactionsQuery.isError ||
    preferencesQuery.isError ||
    classificationsQuery.isError
  const retry = () => {
    void balancesQuery.refetch()
    void transactionsQuery.refetch()
    void preferencesQuery.refetch()
    void classificationsQuery.refetch()
  }

  const accounts = useMemo(() => balanceData?.accounts ?? {}, [balanceData?.accounts])

  const investmentMappings = useMemo(
    () => preferences?.investment_account_mappings ?? {},
    [preferences?.investment_account_mappings],
  )

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
   * today; the projection overlay builds its own future points from the anchor.
   */
  const netWorthData = useMemo(
    () =>
      capSeriesToToday(
        computeNetWorthTimeSeries(transactions, allCategories, categoryProportions),
        'date',
      ),
    [transactions, allCategories, categoryProportions],
  )

  const filteredNetWorthData = useMemo(() => {
    const startDate = dateRange.start_date
    if (!startDate) return netWorthData
    return netWorthData.filter((item) => {
      const d = item.date as string
      return d >= startDate && (!dateRange.end_date || d <= dateRange.end_date)
    })
  }, [netWorthData, dateRange])

  const chartSeries: NetWorthPoint[] = useMemo(
    () =>
      filteredNetWorthData.map((p) => ({
        date: p.date as string,
        netWorth: p.netWorth as number,
      })),
    [filteredNetWorthData],
  )

  const fullSeries: NetWorthPoint[] = useMemo(
    () =>
      netWorthData.map((p) => ({
        date: p.date as string,
        netWorth: p.netWorth as number,
      })),
    [netWorthData],
  )

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

  /**
   * The linear cash-flow model needs two calendar-month deltas for variance.
   * A short history can use the partial month with the existing disclosure;
   * a sparse history counts carried calendar months, not observed rows.
   */
  const hasCompleteMonthGrowthBasis = completeMonthSeries.length >= 3

  const growthStats = useMemo(
    () =>
      computeLinearGrowthStats(
        hasCompleteMonthGrowthBasis ? completeMonthSeries : monthEndSeries,
        12,
      ),
    [hasCompleteMonthGrowthBasis, completeMonthSeries, monthEndSeries],
  )
  const monthlyGrowth = growthStats.growth

  const milestoneRows = useMemo(
    () => buildMilestoneRows(fullSeries, anchor, monthlyGrowth),
    [fullSeries, anchor, monthlyGrowth],
  )

  const chartData = useMemo(() => {
    if (!showProjection || monthlyGrowth <= 0 || anchor === null) {
      // Long ranges collapse to month-end points: an all-time view was
      // feeding ~1,500 daily points into the SVG area chart (slow paint,
      // sub-pixel segments), while the projection path below already renders
      // at monthly resolution. Short windows keep full daily fidelity.
      if (filteredNetWorthData.length > 366) {
        const monthly = downsampleToMonthly(chartSeries)
        const byDate = new Map(filteredNetWorthData.map((p) => [p.date as string, p]))
        return monthly.map((p) => byDate.get(p.date) ?? { date: p.date, netWorth: p.netWorth })
      }
      return filteredNetWorthData
    }
    const monthlyHistorical = monthEndSeries
    const band = projectNetWorthLinearBand(
      anchor,
      monthlyGrowth,
      growthStats.sigma,
      60,
    )

    const historicalPoints = monthlyHistorical.map((p) => ({
      date: p.date,
      netWorth: p.netWorth,
      projected: null as number | null,
      // Recharts <Area> can render a [low, high] tuple as a band when given
      // an array dataKey; null on historical points so the band only paints
      // forward of the anchor.
      projectionBand: null as [number, number] | null,
    }))
    const projectedPoints = [
      {
        date: anchor.date,
        netWorth: null as number | null,
        projected: anchor.netWorth,
        // Anchor point: band collapses to the value (zero uncertainty at t=0).
        projectionBand: [anchor.netWorth, anchor.netWorth] as [number, number] | null,
      },
      ...band.map((p) => ({
        date: p.date,
        netWorth: null as number | null,
        projected: p.mean,
        projectionBand: [p.lower, p.upper] as [number, number] | null,
      })),
    ]
    return [...historicalPoints, ...projectedPoints]
  }, [showProjection, anchor, monthlyGrowth, growthStats.sigma, chartSeries, monthEndSeries, filteredNetWorthData])

  const currentNetWorth = anchor?.netWorth ?? 0

  // The badge and sparkline share the completed calendar-month balance series.
  const monthlyNetWorth = completeMonthSeries

  const netWorthSparkline = useMemo(
    () => monthlyNetWorth.slice(-12).map((p) => p.netWorth),
    [monthlyNetWorth],
  )

  // MoM % change on net worth. Returned only when the prior month-end is a
  // positive base so the percentage is meaningful (negative/zero bases make
  // a "% change" nonsensical -- the card then just omits the badge).
  const netWorthMoMChange = useMemo(() => {
    if (monthlyNetWorth.length < 2) return undefined
    const prev = monthlyNetWorth.at(-2)?.netWorth ?? 0
    const curr = monthlyNetWorth.at(-1)?.netWorth ?? 0
    if (prev <= 0) return undefined
    return Math.round(((curr - prev) / prev) * 1000) / 10
  }, [monthlyNetWorth])

  /**
   * What the MoM badge and sparkline actually compare. Named explicitly because
   * mid-month the most recent completed month is NOT "last month" -- saying so
   * is the difference between an honest delta and a wrong one.
   */
  const netWorthMoMLabel = useMemo(() => {
    const latestMonth = monthlyNetWorth.at(-1)?.date.slice(0, 7)
    if (monthlyNetWorth.length < 2 || !latestMonth) return 'vs last month'
    return `${formatMonthKey(latestMonth, { month: 'short', year: '2-digit' })} vs prior month`
  }, [monthlyNetWorth])

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
    growthUsesPartialMonth: !hasCompleteMonthGrowthBasis,
    anchor,
    milestoneRows,
    currentNetWorth,
    netWorthSparkline,
    netWorthMoMChange,
    netWorthMoMLabel,
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
