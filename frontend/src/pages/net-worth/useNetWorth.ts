import { useCallback, useEffect, useMemo, useState } from 'react'

import { useAccountBalances } from '@/hooks/api/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'
import { usePreferences } from '@/hooks/api/usePreferences'
import { accountClassificationsService } from '@/services/api/accountClassifications'

import {
  computeMonthlyGrowthRate,
  computeMonthlyGrowthStats,
  downsampleToMonthly,
  projectNetWorthCompoundBand,
  buildMilestoneRowsCompound,
  type NetWorthPoint,
} from './netWorthProjection'
import {
  computeNetWorthTimeSeries,
  resolveAccountCategory,
  resolveAccountType,
} from './netWorthUtils'

export function useNetWorth() {
  const { data: balanceData, isLoading: balancesLoading } = useAccountBalances()
  const { data: transactions = [], isLoading: transactionsLoading } = useTransactions()
  const { data: preferences } = usePreferences()
  const [showStacked, setShowStacked] = useState(false)
  const [showProjection, setShowProjection] = useState(false)
  const [classifications, setClassifications] = useState<Record<string, string>>({})
  const [expandedAssetCategories, setExpandedAssetCategories] = useState<Set<string>>(new Set())
  const [expandedLiabilityCategories, setExpandedLiabilityCategories] = useState<Set<string>>(
    new Set(),
  )

  const { dateRange, timeFilterProps } = useAnalyticsTimeFilter(transactions, {
    defaultViewMode: 'all_time',
  })

  useEffect(() => {
    const loadClassifications = async () => {
      try {
        const data = await accountClassificationsService.getAllClassifications()
        setClassifications(data)
      } catch {
        /* defaults if loading fails */
      }
    }
    loadClassifications()
  }, [])

  const isLoading = balancesLoading || transactionsLoading

  const accounts = useMemo(() => balanceData?.accounts || {}, [balanceData?.accounts])
  const totalAssets = Object.values(accounts)
    .filter((acc) => acc.balance > 0)
    .reduce((sum, acc) => sum + acc.balance, 0)
  const totalLiabilities = Math.abs(
    Object.values(accounts)
      .filter((acc) => acc.balance < 0)
      .reduce((sum, acc) => sum + acc.balance, 0),
  )
  const netWorth = totalAssets - totalLiabilities

  const investmentMappings = useMemo(
    () => preferences?.investment_account_mappings || {},
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

  const categoryTotals = useMemo(() => {
    return Object.entries(accounts).reduce(
      (acc, [name, data]) => {
        const category = categorizeAccount(name)
        if (!acc[category]) acc[category] = 0
        acc[category] += Math.abs(data.balance)
        return acc
      },
      {} as Record<string, number>,
    )
  }, [accounts, categorizeAccount])

  const allCategories = useMemo(() => {
    const categories = new Set(Object.keys(categoryTotals))
    return Array.from(categories).filter(
      (cat) => !['Credit Cards', 'Loans', 'Loans/Lended', 'Other'].includes(cat),
    )
  }, [categoryTotals])

  const totalPositive = useMemo(() => totalAssets, [totalAssets])

  const categoryProportions = useMemo(() => {
    const props: Record<string, number> = {}
    allCategories.forEach((cat) => {
      props[cat] = totalPositive > 0 ? (categoryTotals[cat] || 0) / totalPositive : 0
    })
    return props
  }, [categoryTotals, allCategories, totalPositive])

  const netWorthData = useMemo(
    () => computeNetWorthTimeSeries(transactions, allCategories, categoryProportions),
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

  const monthlyGrowthRate = useMemo(() => computeMonthlyGrowthRate(chartSeries, 12), [chartSeries])

  const monthlyGrowthLogSigma = useMemo(
    () => computeMonthlyGrowthStats(chartSeries, 12).logSigma,
    [chartSeries],
  )

  const milestoneRows = useMemo(
    () => buildMilestoneRowsCompound(fullSeries, anchor, monthlyGrowthRate),
    [fullSeries, anchor, monthlyGrowthRate],
  )

  const chartData = useMemo(() => {
    if (!showProjection || monthlyGrowthRate <= 0 || anchor === null) {
      return filteredNetWorthData
    }
    const monthlyHistorical = downsampleToMonthly(chartSeries)
    const band = projectNetWorthCompoundBand(
      anchor,
      monthlyGrowthRate,
      monthlyGrowthLogSigma,
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
  }, [showProjection, anchor, monthlyGrowthRate, monthlyGrowthLogSigma, chartSeries, filteredNetWorthData])

  const currentNetWorth = anchor?.netWorth ?? 0

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
    monthlyGrowthRate,
    anchor,
    milestoneRows,
    currentNetWorth,
    expandedAssetCategories,
    setExpandedAssetCategories,
    expandedLiabilityCategories,
    setExpandedLiabilityCategories,
    timeFilterProps,
    getAccountType,
    toggleCategory,
  }
}
