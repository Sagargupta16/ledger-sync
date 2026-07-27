import { useEffect, useMemo, useState } from 'react'

import { useAccountBalances } from '@/hooks/api/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'

import {
  buildCombinedChartData,
  calculateSIPProjection,
  computeGainsDisplay,
  computeInvestmentDuration,
  computeXirrPercent,
  detectMonthlySIPAmount,
  filterSipTransfers,
  findPrimaryAccount,
  loadMutualFundAccountsData,
} from './projectionUtils'
import type { ChartDataPoint, MutualFundAccount } from './types'

export function useMutualFundProjection() {
  const balancesQuery = useAccountBalances()
  const transactionsQuery = useTransactions()
  const balanceData = balancesQuery.data
  const transactions = useMemo(
    () => transactionsQuery.data ?? [],
    [transactionsQuery.data],
  )

  const [monthlySIP, setMonthlySIP] = useState(10000)
  const [expectedReturn, setExpectedReturn] = useState(12)
  const [projectionYears, setProjectionYears] = useState(10)
  const [sipGrowthRate, setSipGrowthRate] = useState(0)
  const [userModifiedSIP, setUserModifiedSIP] = useState(false)
  const [currentValueInput, setCurrentValueInput] = useState(0)
  const [mutualFundAccounts, setMutualFundAccounts] = useState<MutualFundAccount[]>([])
  const [accountLoadError, setAccountLoadError] = useState(false)

  useEffect(() => {
    loadMutualFundAccountsData(balanceData as Record<string, unknown> | undefined)
      .then((accounts) => {
        setMutualFundAccounts(accounts)
        setAccountLoadError(false)
      })
      .catch(() => {
        setMutualFundAccounts([])
        setAccountLoadError(true)
      })
  }, [balanceData])

  const retry = () => {
    setAccountLoadError(false)
    void balancesQuery.refetch()
    void transactionsQuery.refetch()
  }

  const primaryAccount = useMemo(() => findPrimaryAccount(mutualFundAccounts), [mutualFundAccounts])
  const currentBalance = primaryAccount?.balance ?? 0

  const sipTransfers = useMemo(() => {
    if (!primaryAccount) return []
    return filterSipTransfers(transactions, primaryAccount.name).map((tx) => ({
      ...tx,
      amount: Math.abs(tx.amount),
    }))
  }, [transactions, primaryAccount])

  const detectedMonthlySIP = useMemo(() => detectMonthlySIPAmount(sipTransfers), [sipTransfers])

  const activeMonthlySIP = userModifiedSIP ? monthlySIP : detectedMonthlySIP || monthlySIP
  const totalHistoricalInvested = sipTransfers.reduce((sum, tx) => sum + tx.amount, 0)
  const effectiveCurrentValue = currentValueInput > 0 ? currentValueInput : currentBalance

  const projection = useMemo(
    () =>
      calculateSIPProjection(
        activeMonthlySIP,
        expectedReturn,
        projectionYears,
        sipGrowthRate,
        effectiveCurrentValue,
      ),
    [activeMonthlySIP, expectedReturn, projectionYears, sipGrowthRate, effectiveCurrentValue],
  )

  const chartData = useMemo<ChartDataPoint[]>(
    () =>
      buildCombinedChartData(
        sipTransfers,
        effectiveCurrentValue,
        activeMonthlySIP,
        expectedReturn,
        projectionYears,
        sipGrowthRate,
      ),
    [
      sipTransfers,
      effectiveCurrentValue,
      activeMonthlySIP,
      expectedReturn,
      projectionYears,
      sipGrowthRate,
    ],
  )

  // `realizedGains = currentBalance - totalHistoricalInvested` used to live here
  // and feed a "Realized Gain / +x% returns" card. currentBalance is itself the
  // running sum of those same contributions (the backend derives account balances
  // from flows -- there is no market value in the source data), so the difference
  // was just the stray income/expense rows booked on the account: 1,311.43 on
  // 911,000 invested, displayed as "+0.14% returns". Removed rather than relabelled.
  //
  // The gain/XIRR pair below is different: it is real once the user supplies a
  // current value AND there is a contribution base to measure it against, so it
  // stays and the page tells the user when it is only echoing the book balance
  // back at them. Both conditions matter: with no contributions the percentage
  // guard below returns 0, which would print a confident "+0.00% return" on an
  // empty denominator.
  const hasCurrentValueOverride = currentValueInput > 0 && totalHistoricalInvested > 0

  const overrideGains = effectiveCurrentValue - totalHistoricalInvested
  const overrideGainsPercent =
    totalHistoricalInvested > 0 ? (overrideGains / totalHistoricalInvested) * 100 : 0

  const xirrPercent = useMemo(
    () => computeXirrPercent(sipTransfers, effectiveCurrentValue),
    [sipTransfers, effectiveCurrentValue],
  )

  const investmentDurationYears = useMemo(
    () => computeInvestmentDuration(sipTransfers),
    [sipTransfers],
  )

  const display = computeGainsDisplay(overrideGainsPercent, xirrPercent)
  const currentValueLabel =
    currentValueInput > 0 ? 'Using your entered value' : 'Using portfolio balance'
  const effectiveValueLabel = currentValueInput > 0 ? 'Manual override' : 'From portfolio'
  const sipGrowthLabel =
    sipGrowthRate === 0 ? 'No annual increase' : `SIP increases ${sipGrowthRate}% yearly`
  const sipInputValue = userModifiedSIP ? monthlySIP : detectedMonthlySIP || monthlySIP
  const showAutoDetectedHint = detectedMonthlySIP > 0 && !userModifiedSIP

  return {
    isLoading: balancesQuery.isLoading || transactionsQuery.isLoading,
    isError: balancesQuery.isError || transactionsQuery.isError || accountLoadError,
    retry,
    primaryAccount,
    currentBalance,
    sipTransfers,
    detectedMonthlySIP,
    activeMonthlySIP,
    totalHistoricalInvested,
    effectiveCurrentValue,
    projection,
    chartData,
    hasCurrentValueOverride,
    overrideGains,
    overrideGainsPercent,
    xirrPercent,
    investmentDurationYears,
    monthlySIP,
    expectedReturn,
    projectionYears,
    sipGrowthRate,
    currentValueInput,
    sipInputValue,
    showAutoDetectedHint,
    sipGrowthLabel,
    currentValueLabel,
    effectiveValueLabel,
    setMonthlySIP,
    setExpectedReturn,
    setProjectionYears,
    setSipGrowthRate,
    setUserModifiedSIP,
    setCurrentValueInput,
    ...display,
  }
}
