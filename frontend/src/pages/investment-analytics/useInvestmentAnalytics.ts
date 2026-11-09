import { useMemo } from 'react'

import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'
import { usePaletteSnapshot } from '@/hooks/usePaletteSnapshot'
import { capSeriesToToday, getCurrentMonth, getTodayKey } from '@/lib/dateUtils'
import { blockingError, refreshFailed, retryFailed } from '@/lib/queryStatus'
import { calculateXIRR, type CashFlow } from '@/lib/xirr'
import {
  investmentAccountTest,
  investmentTransferDelta,
  netInvestmentTransferFlow,
} from '@/lib/finance/investmentFlows'
import { investmentReturnRules } from '@/lib/finance/investmentReturns'
import { resolveIncomeClassification } from '@/store/preferencesStore'

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
  const transactionsQuery = useTransactions()
  const preferencesQuery = usePreferences()
  const transactions = useMemo(
    () => transactionsQuery.data ?? [],
    [transactionsQuery.data],
  )
  /**
   * Rows dated today or earlier. The ledger carries forward-dated accruals (a
   * month-end EPF booking entered days ahead), and the portfolio value is a
   * position AS OF TODAY: counting a contribution that has not happened yet
   * inflated the total, and the XIRR terminal value built on it.
   */
  const pastTransactions = useMemo(() => {
    const today = getTodayKey()
    return transactions.filter((tx) => tx.date.slice(0, 10) <= today)
  }, [transactions])
  const preferences = preferencesQuery.data

  const investmentMappings = useMemo(
    () => preferences?.investment_account_mappings ?? {},
    [preferences?.investment_account_mappings],
  )
  const investmentAccounts = useMemo(() => Object.keys(investmentMappings), [investmentMappings])
  const isInvestment = useMemo(() => investmentAccountTest(investmentAccounts), [investmentAccounts])

  const statusReads = [transactionsQuery, preferencesQuery]
  const isLoading = transactionsQuery.isLoading || preferencesQuery.isLoading
  // Only a read with nothing to show blocks the page; one that failed but kept
  // its data raises `refreshFailed`.
  const isError = blockingError(statusReads)
  const retry = () => {
    void retryFailed(statusReads)
  }

  const accountToCategory = useMemo(() => {
    const mapping: Record<string, InvestmentCategory> = {}
    Object.entries(investmentMappings).forEach(([accountName, rawType]) => {
      mapping[accountName] = mapToCategory(rawType)
    })
    return mapping
  }, [investmentMappings])

  const filteredInvestmentTotals = useMemo(() => {
    if (!pastTransactions.length || !investmentAccounts.length) {
      return {
        byAccount: {},
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

    pastTransactions.forEach((tx) => {
      processInvestmentTransaction(
        tx,
        isInvestment,
        accountToCategory,
        byAccount,
        byCategory,
      )
    })

    // Paise precision: float accumulation leaves ~1e-11 on a fully redeemed
    // account, which would pass the `> 0` checks below and list a 0.00 row.
    for (const account of Object.keys(byAccount)) {
      byAccount[account] = Math.round(byAccount[account] * 100) / 100
    }
    for (const category of INVESTMENT_CATEGORIES) {
      byCategory[category] = Math.round(byCategory[category] * 100) / 100
    }

    const total = Object.values(byCategory).reduce((sum, val) => sum + val, 0)
    return { byAccount, byCategory, total }
  }, [pastTransactions, investmentAccounts, isInvestment, accountToCategory])

  const totalInvestmentValue = filteredInvestmentTotals.total

  // Same as-of-today row set as the value above: the terminal cash flow is that
  // value, so a future contribution in the flows would count against it twice.
  const portfolioXIRR = useMemo((): number => {
    if (!investmentAccounts.length || !pastTransactions.length) return 0

    const cashflows: CashFlow[] = []

    for (const tx of pastTransactions) {
      if (tx.type !== 'Transfer') continue
      const d = new Date(tx.date)
      if (Number.isNaN(d.getTime())) continue
      const amount = investmentTransferDelta(tx, isInvestment)
      if (amount !== 0) cashflows.push({ date: d, amount })
    }
    if (cashflows.length < 1 || totalInvestmentValue <= 0) return 0

    cashflows.push({ date: new Date(), amount: -totalInvestmentValue })
    cashflows.sort((a, b) => a.date.getTime() - b.date.getTime())

    return calculateXIRR(cashflows)
  }, [pastTransactions, investmentAccounts, isInvestment, totalInvestmentValue])

  const returnRules = useMemo(
    () => investmentReturnRules(preferences ? resolveIncomeClassification(preferences) : undefined),
    [preferences],
  )
  const netInvestmentPL = useMemo(
    () => computeNetInvestmentPL(pastTransactions, returnRules),
    [pastTransactions, returnRules],
  )
  const plPercent = totalInvestmentValue > 0 ? (netInvestmentPL / totalInvestmentValue) * 100 : 0

  const monthlyInvestmentTarget = preferences?.monthly_investment_target ?? 0

  const currentMonthInvestment = useMemo(() => {
    if (!transactions.length || !investmentAccounts.length) return 0
    const currentMonthKey = getCurrentMonth()
    return netInvestmentTransferFlow(
      transactions.filter((tx) => tx.date.startsWith(currentMonthKey)),
      isInvestment,
    )
  }, [transactions, investmentAccounts, isInvestment])

  const targetProgress =
    monthlyInvestmentTarget > 0
      ? Math.min((currentMonthInvestment / monthlyInvestmentTarget) * 100, 100)
      : 0

  // Theme-scoped copy, so the breakdown re-colours on a theme toggle.
  const categoryColors = usePaletteSnapshot(CATEGORY_COLORS)
  const investmentTypeBreakdown = useMemo(() => {
    const breakdown = filteredInvestmentTotals.byCategory
    const shown = INVESTMENT_CATEGORIES.filter((cat) => breakdown[cat] > 0)
    // Shares are of the classes drawn: an overdrawn class cannot be a slice, and
    // its negative balance in the denominator pushed the slices past 100%.
    const shownTotal = shown.reduce((sum, cat) => sum + breakdown[cat], 0)
    return shown
      .map((name) => ({
        name,
        value: breakdown[name],
        color: categoryColors[name],
        percentage: shownTotal > 0 ? ((breakdown[name] / shownTotal) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => b.value - a.value)
  }, [filteredInvestmentTotals, categoryColors])

  // Total accounts with a positive balance, before the top-8 cap below. Lets the
  // table surface a "+N more accounts" note when some are hidden.
  const totalInvestmentAccountCount = useMemo(
    () => Object.values(filteredInvestmentTotals.byAccount).filter((value) => value > 0).length,
    [filteredInvestmentTotals],
  )

  const portfolioData = useMemo(() => {
    const positive = Object.entries(filteredInvestmentTotals.byAccount).filter(
      ([, value]) => value > 0,
    )
    // Share of the accounts with a positive balance, so overdrawn accounts
    // cannot push the listed shares past 100%.
    const positiveTotal = positive.reduce((sum, [, value]) => sum + value, 0)
    return positive
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({
        name,
        value,
        balance: value,
        investmentType: accountToCategory[name] || 'Mutual Funds',
        percentage: positiveTotal > 0 ? ((value / positiveTotal) * 100).toFixed(1) : '0',
      }))
  }, [filteredInvestmentTotals, accountToCategory])

  // HISTORICAL series, so it stops at today. The all-time view has no end date
  // to clip it, and a forward-dated accrual otherwise drew a point in the future.
  const dailyGrowthData = useMemo(
    () => capSeriesToToday(
      buildDailyGrowthSeries(transactions, investmentAccounts, accountToCategory, getTodayKey()),
      'fullDate',
    ),
    [transactions, investmentAccounts, accountToCategory],
  )

  const { dateRange, timeFilterProps } = useAnalyticsTimeFilter(transactions, {
    defaultViewMode: 'all_time',
  })

  const filteredGrowthData = useMemo(() => {
    const startDate = dateRange.start_date
    const endDate = dateRange.end_date
    // Each bound applies on its own: the all-time view with an earning start
    // set has a start and no end.
    const ranged =
      !startDate && !endDate
        ? dailyGrowthData
        : dailyGrowthData.filter((item) => {
            const d = item.fullDate as string
            return (!startDate || d >= startDate) && (!endDate || d <= endDate)
          })
    // Long ranges collapse to month-end points: the forward-filled daily
    // series feeds 4 stacked SVG areas, and an all-time view was painting
    // ~2,700 points per area (sluggish first paint + hover). Month-end
    // sampling preserves the shape; short windows keep daily fidelity.
    let plotted = ranged
    if (ranged.length > 366) {
      const byMonth = new Map<string, (typeof ranged)[number]>()
      for (const item of ranged) {
        byMonth.set((item.fullDate as string).substring(0, 7), item)
      }
      plotted = [...byMonth.values()]
    }
    if (plotted.length === 0) return plotted
    // The balance carried into the window, stamped on the first row: the chart
    // measures its change from here, not from the first plotted close, which
    // would drop that day (or, once sampled, that whole month).
    const before = startDate
      ? dailyGrowthData.filter((item) => (item.fullDate as string) < startDate).at(-1)
      : undefined
    const openingBalance = before
      ? INVESTMENT_CATEGORIES.reduce((sum, category) => sum + Number(before[category] ?? 0), 0)
      : 0
    return [{ ...plotted[0], openingBalance }, ...plotted.slice(1)]
  }, [dailyGrowthData, dateRange])

  return {
    isLoading,
    isError,
    refreshFailed: refreshFailed(statusReads),
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
