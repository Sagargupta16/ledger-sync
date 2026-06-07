/**
 * Data + derived state for the Returns Analysis page. Owns transaction
 * fetching, time-filtering, investment-account extraction, and all the
 * memoized P&L / CAGR computations so the page component stays presentational.
 */

import { useMemo } from 'react'

import { isInvestmentAccount } from '@/constants/accountTypes'
import { useAccountBalances, useMonthlyAggregation } from '@/hooks/api/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { getDateKey } from '@/lib/dateUtils'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'

import { calculateCAGR, computeInvestmentMetrics, groupTransactionsByMonth } from './returnsAnalysisUtils'

export function useReturnsAnalysis() {
  const { data: allTransactions = [] } = useTransactions()
  const { dateRange, timeFilterProps } = useAnalyticsTimeFilter(allTransactions)
  const dateParams = { start_date: dateRange.start_date ?? undefined, end_date: dateRange.end_date ?? undefined }
  const { data: balanceData, isLoading: balancesLoading } = useAccountBalances(dateParams)
  const { data: aggregationData, isLoading: aggregationLoading } = useMonthlyAggregation(dateParams)
  const isLoading = balancesLoading || aggregationLoading

  const transactions = useMemo(() => {
    const startDate = dateRange.start_date
    if (!startDate) return allTransactions
    return allTransactions.filter(tx => {
      const txDate = getDateKey(tx.date)
      return txDate >= startDate && (!dateRange.end_date || txDate <= dateRange.end_date)
    })
  }, [allTransactions, dateRange])

  const investmentAccounts = useMemo(() => {
    const accounts = balanceData?.accounts || {}
    return Object.entries(accounts)
      .filter(([name]) => isInvestmentAccount(name))
      .map(([name, data]) => ({
        name,
        balance: Math.abs((data as { balance: number; transactions: number }).balance),
        transactions: (data as { balance: number; transactions: number }).transactions,
      }))
      .sort((a, b) => b.balance - a.balance)
  }, [balanceData])

  const { dividendIncome, brokerFees, interestIncome, investmentProfit, investmentLoss, netProfitLoss } =
    useMemo(() => computeInvestmentMetrics(transactions), [transactions])

  const totalIncome = investmentProfit + dividendIncome + interestIncome
  const totalExpenses = investmentLoss + brokerFees

  const monthlyDataArray = useMemo(() => {
    return Object.entries(aggregationData || {})
      .map(([month, value]) => ({ month, ...(value as { income?: number; expense?: number }) }))
      .sort((a, b) => a.month.localeCompare(b.month))
  }, [aggregationData])

  const estimatedCAGR = useMemo(() => {
    if (monthlyDataArray.length < 2) return 0
    const first = monthlyDataArray[0]
    const last = monthlyDataArray[monthlyDataArray.length - 1]
    const years = monthlyDataArray.length / 12
    return calculateCAGR(last.income || 1, first.income || 1, Math.max(years, 0.1))
  }, [monthlyDataArray])

  // Monthly combo chart: bars for monthly P&L + cumulative line
  const monthlyComboData = useMemo(() => groupTransactionsByMonth(transactions), [transactions])

  // Monthly returns heatmap strip
  const monthlyReturns = useMemo(() => {
    return monthlyComboData.map(d => ({ month: d.month, net: d.net }))
  }, [monthlyComboData])

  const roi = monthlyDataArray.length > 0 ? estimatedCAGR / 12 : 0

  return {
    isLoading,
    timeFilterProps,
    investmentAccounts,
    dividendIncome, brokerFees, interestIncome, investmentProfit, investmentLoss, netProfitLoss,
    totalIncome, totalExpenses,
    estimatedCAGR, roi,
    monthlyComboData, monthlyReturns,
  }
}
