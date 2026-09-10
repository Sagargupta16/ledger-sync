/**
 * Data + derived state for the Returns Analysis page. Owns transaction
 * fetching, time-filtering, investment-account extraction, and the memoized
 * realised-P&L computations so the page component stays presentational.
 *
 * Realised cash only: no rate of return is derived here, because the statements
 * this app ingests carry cost basis with no market value. See the note beside
 * `totalExpenses` for the CAGR/ROI pair that used to live here.
 */

import { useMemo } from 'react'

import { isInvestmentAccount } from '@/constants/accountTypes'
import { useAccountBalances } from '@/hooks/api/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { getDateKey } from '@/lib/dateUtils'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'

import {
  computeInvestmentMetrics,
  groupTransactionsByMonth,
} from './returnsAnalysisUtils'

export function useReturnsAnalysis() {
  const transactionsQuery = useTransactions()
  const {
    data: allTransactions = [],
    isLoading: transactionsLoading,
    isError: transactionsError,
  } = transactionsQuery
  const preferencesQuery = usePreferences()
  const { dateRange, timeFilterProps } = useAnalyticsTimeFilter(allTransactions)
  // A closing balance includes contributions before the selected P&L window.
  const dateParams = { end_date: dateRange.end_date ?? undefined }
  const balancesQuery = useAccountBalances(dateParams)
  const {
    data: balanceData,
    isLoading: balancesLoading,
    isError: balancesError,
  } = balancesQuery
  // The monthly-aggregation query that used to be fetched here fed only the
  // removed CAGR/ROI pair, so nothing reads it now and the request is gone.
  // Include the transactions query: the P&L metrics derive from `transactions`,
  // so omitting it flashed zeros as if loaded before transactions arrived.
  const isLoading = transactionsLoading || balancesLoading || preferencesQuery.isLoading
  const isError = transactionsError || balancesError || preferencesQuery.isError

  const transactions = useMemo(() => {
    const startDate = dateRange.start_date
    if (!startDate) return allTransactions
    return allTransactions.filter(tx => {
      const txDate = getDateKey(tx.date)
      return txDate >= startDate && (!dateRange.end_date || txDate <= dateRange.end_date)
    })
  }, [allTransactions, dateRange])

  const investmentAccounts = useMemo(() => {
    const accounts = balanceData?.accounts ?? {}
    const mappings = preferencesQuery.data?.investment_account_mappings ?? {}
    return Object.entries(accounts)
      .filter(([name]) => Object.hasOwn(mappings, name) || isInvestmentAccount(name))
      .map(([name, data]) => ({
        name,
        balance: data.balance,
        transactions: data.transactions,
      }))
      .sort((a, b) => b.balance - a.balance)
  }, [balanceData, preferencesQuery.data?.investment_account_mappings])

  const {
    dividendIncome, brokerFees, interestIncome, investmentProfit, investmentLoss, netProfitLoss,
    totalIncome, totalExpenses, eventCount: realisedEventCount,
  } = useMemo(() => computeInvestmentMetrics(transactions), [transactions])

  // `estimatedCAGR` and `roi` used to be derived here. estimatedCAGR compared
  // the FIRST and LAST month's TOTAL INCOME (salary, not investments) and called
  // the ratio a portfolio CAGR; roi then converted that to a monthly-equivalent
  // rate. On the real ledger's default FY window (4 months, Apr income 225,835 vs
  // a part-month Jul 9,911) that produced CAGR -99.99% and Monthly ROI -54.23%.
  // No market value exists in the source data, so no return is computable and
  // nothing here replaces them with a different rate.

  // Monthly combo chart: bars for monthly P&L + cumulative line
  const monthlyComboData = useMemo(() => groupTransactionsByMonth(transactions), [transactions])

  // Monthly returns heatmap strip
  const monthlyReturns = useMemo(() => {
    return monthlyComboData.map(d => ({ month: d.month, net: d.net }))
  }, [monthlyComboData])

  const retry = () => {
    const retries: Array<Promise<unknown>> = []
    if (transactionsQuery.isError) retries.push(transactionsQuery.refetch())
    if (balancesQuery.isError) retries.push(balancesQuery.refetch())
    if (preferencesQuery.isError) retries.push(preferencesQuery.refetch())
    void Promise.all(retries)
  }

  return {
    isLoading,
    isError,
    retry,
    timeFilterProps,
    investmentAccounts,
    dividendIncome, brokerFees, interestIncome, investmentProfit, investmentLoss, netProfitLoss,
    totalIncome, totalExpenses,
    realisedEventCount,
    monthlyComboData, monthlyReturns,
  }
}
