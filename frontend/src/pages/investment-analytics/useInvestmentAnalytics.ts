import { useMemo } from 'react'

import { useAccountBalances } from '@/hooks/api/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'
import { calculateXIRR, type CashFlow } from '@/lib/xirr'

import {
  CATEGORY_COLORS,
  INVESTMENT_CATEGORIES,
  buildDailyGrowthSeries,
  computeNetInvestmentPL,
  mapToCategory,
  processInvestmentTransaction,
  type InvestmentCategory,
} from './investmentUtils'

export function useInvestmentAnalytics() {
  const balancesQuery = useAccountBalances()
  const transactionsQuery = useTransactions()
  const preferencesQuery = usePreferences()
  const transactions = useMemo(
    () => transactionsQuery.data ?? [],
    [transactionsQuery.data],
  )
  const preferences = preferencesQuery.data

  const investmentMappings = useMemo(
    () => preferences?.investment_account_mappings ?? {},
    [preferences?.investment_account_mappings],
  )
  const investmentAccounts = useMemo(() => Object.keys(investmentMappings), [investmentMappings])

  const isLoading =
    balancesQuery.isLoading ||
    transactionsQuery.isLoading ||
    preferencesQuery.isLoading
  const isError =
    balancesQuery.isError ||
    transactionsQuery.isError ||
    preferencesQuery.isError
  const retry = () => {
    void balancesQuery.refetch()
    void transactionsQuery.refetch()
    void preferencesQuery.refetch()
  }

  const accountToCategory = useMemo(() => {
    const mapping: Record<string, InvestmentCategory> = {}
    Object.entries(investmentMappings).forEach(([accountName, rawType]) => {
      mapping[accountName] = mapToCategory(rawType as string)
    })
    return mapping
  }, [investmentMappings])

  const filteredInvestmentTotals = useMemo(() => {
    if (!transactions.length || !investmentAccounts.length) {
      return {
        byAccount: {} as Record<string, number>,
        byCategory: {} as Record<InvestmentCategory, number>,
        total: 0,
      }
    }

    const byAccount: Record<string, number> = {}
    investmentAccounts.forEach((acc) => {
      byAccount[acc] = 0
    })

    const byCategory: Record<InvestmentCategory, number> = {
      'FD/Bonds': 0,
      'Mutual Funds': 0,
      'PPF/EPF': 0,
      Stocks: 0,
    }

    transactions.forEach((tx) => {
      processInvestmentTransaction(
        tx,
        investmentAccounts,
        accountToCategory,
        byAccount,
        byCategory,
      )
    })

    const total = Object.values(byCategory).reduce((sum, val) => sum + val, 0)
    return { byAccount, byCategory, total }
  }, [transactions, investmentAccounts, accountToCategory])

  const totalInvestmentValue = filteredInvestmentTotals.total

  const portfolioXIRR = useMemo((): number => {
    if (!investmentAccounts.length || !transactions.length) return 0

    const invSet = new Set(investmentAccounts)
    const cashflows: CashFlow[] = []

    for (const tx of transactions) {
      if (tx.type !== 'Transfer') continue
      const d = new Date(tx.date)
      if (Number.isNaN(d.getTime())) continue
      const toInv = invSet.has(tx.to_account ?? '')
      const fromInv = invSet.has(tx.from_account ?? '')
      if (toInv && !fromInv) {
        cashflows.push({ date: d, amount: tx.amount })
      } else if (fromInv && !toInv) {
        cashflows.push({ date: d, amount: -tx.amount })
      }
    }
    if (cashflows.length < 1 || totalInvestmentValue <= 0) return 0

    cashflows.push({ date: new Date(), amount: -totalInvestmentValue })
    cashflows.sort((a, b) => a.date.getTime() - b.date.getTime())

    return calculateXIRR(cashflows)
  }, [transactions, investmentAccounts, totalInvestmentValue])

  const netInvestmentPL = useMemo(() => computeNetInvestmentPL(transactions), [transactions])
  const plPercent = totalInvestmentValue > 0 ? (netInvestmentPL / totalInvestmentValue) * 100 : 0

  const monthlyInvestmentTarget = preferences?.monthly_investment_target ?? 0

  const currentMonthInvestment = useMemo(() => {
    if (!transactions.length || !investmentAccounts.length) return 0
    const now = new Date()
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    let total = 0
    for (const tx of transactions) {
      if (!tx.date.startsWith(currentMonthKey)) continue
      if (tx.type === 'Transfer' && investmentAccounts.includes(tx.to_account ?? '')) {
        total += tx.amount
      }
    }
    return total
  }, [transactions, investmentAccounts])

  const targetProgress =
    monthlyInvestmentTarget > 0
      ? Math.min((currentMonthInvestment / monthlyInvestmentTarget) * 100, 100)
      : 0

  const investmentTypeBreakdown = useMemo(() => {
    const breakdown = filteredInvestmentTotals.byCategory
    return INVESTMENT_CATEGORIES.filter((cat) => breakdown[cat] > 0)
      .map((name) => ({
        name,
        value: breakdown[name],
        color: CATEGORY_COLORS[name],
        percentage:
          totalInvestmentValue > 0
            ? ((breakdown[name] / totalInvestmentValue) * 100).toFixed(1)
            : '0',
      }))
      .sort((a, b) => b.value - a.value)
  }, [filteredInvestmentTotals, totalInvestmentValue])

  // Total accounts with a positive balance, before the top-8 cap below. Lets the
  // table surface a "+N more accounts" note when some are hidden.
  const totalInvestmentAccountCount = useMemo(
    () => Object.values(filteredInvestmentTotals.byAccount).filter((value) => value > 0).length,
    [filteredInvestmentTotals],
  )

  const portfolioData = useMemo(() => {
    return Object.entries(filteredInvestmentTotals.byAccount)
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({
        name,
        value,
        balance: value,
        investmentType: accountToCategory[name] || 'Mutual Funds',
        percentage:
          totalInvestmentValue > 0 ? ((value / totalInvestmentValue) * 100).toFixed(1) : '0',
      }))
  }, [filteredInvestmentTotals, accountToCategory, totalInvestmentValue])

  const dailyGrowthData = useMemo(
    () => buildDailyGrowthSeries(transactions, investmentAccounts, accountToCategory),
    [transactions, investmentAccounts, accountToCategory],
  )

  const { dateRange, timeFilterProps } = useAnalyticsTimeFilter(transactions, {
    defaultViewMode: 'all_time',
  })

  const filteredGrowthData = useMemo(() => {
    const startDate = dateRange.start_date
    const endDate = dateRange.end_date
    const ranged =
      !startDate || !endDate
        ? dailyGrowthData
        : dailyGrowthData.filter((item) => {
            const d = item.fullDate as string
            return d >= startDate && d <= endDate
          })
    // Long ranges collapse to month-end points: the forward-filled daily
    // series feeds 4 stacked SVG areas, and an all-time view was painting
    // ~2,700 points per area (sluggish first paint + hover). Month-end
    // sampling preserves the shape; short windows keep daily fidelity.
    if (ranged.length <= 366) return ranged
    const byMonth = new Map<string, (typeof ranged)[number]>()
    for (const item of ranged) {
      byMonth.set((item.fullDate as string).substring(0, 7), item)
    }
    return [...byMonth.values()]
  }, [dailyGrowthData, dateRange])

  return {
    isLoading,
    isError,
    retry,
    investmentAccounts,
    totalInvestmentValue,
    portfolioXIRR,
    netInvestmentPL,
    plPercent,
    monthlyInvestmentTarget,
    currentMonthInvestment,
    targetProgress,
    investmentTypeBreakdown,
    portfolioData,
    totalInvestmentAccountCount,
    filteredGrowthData,
    timeFilterProps,
  }
}
