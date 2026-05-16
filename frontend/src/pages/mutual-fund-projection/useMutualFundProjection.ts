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
  const { data: balanceData, isLoading } = useAccountBalances()
  const { data: transactions = [] } = useTransactions()

  const [monthlySIP, setMonthlySIP] = useState(10000)
  const [expectedReturn, setExpectedReturn] = useState(12)
  const [projectionYears, setProjectionYears] = useState(10)
  const [sipGrowthRate, setSipGrowthRate] = useState(0)
  const [userModifiedSIP, setUserModifiedSIP] = useState(false)
  const [currentValueInput, setCurrentValueInput] = useState(0)
  const [mutualFundAccounts, setMutualFundAccounts] = useState<MutualFundAccount[]>([])

  useEffect(() => {
    loadMutualFundAccountsData(balanceData as Record<string, unknown> | undefined)
      .then(setMutualFundAccounts)
      .catch(() => setMutualFundAccounts([]))
  }, [balanceData])

  const primaryAccount = useMemo(() => findPrimaryAccount(mutualFundAccounts), [mutualFundAccounts])
  const currentBalance = primaryAccount?.balance || 0

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

  const realizedGains = currentBalance - totalHistoricalInvested
  const realizedGainsPercent =
    totalHistoricalInvested > 0 ? (realizedGains / totalHistoricalInvested) * 100 : 0

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

  const display = computeGainsDisplay(
    realizedGains,
    realizedGainsPercent,
    overrideGainsPercent,
    xirrPercent,
  )
  const currentValueLabel =
    currentValueInput > 0 ? 'Using your entered value' : 'Using portfolio balance'
  const effectiveValueLabel = currentValueInput > 0 ? 'Manual override' : 'From portfolio'
  const sipGrowthLabel =
    sipGrowthRate === 0 ? 'No annual increase' : `SIP increases ${sipGrowthRate}% yearly`
  const sipInputValue = userModifiedSIP ? monthlySIP : detectedMonthlySIP || monthlySIP
  const showAutoDetectedHint = detectedMonthlySIP > 0 && !userModifiedSIP

  return {
    isLoading,
    primaryAccount,
    currentBalance,
    sipTransfers,
    detectedMonthlySIP,
    activeMonthlySIP,
    totalHistoricalInvested,
    effectiveCurrentValue,
    projection,
    chartData,
    realizedGains,
    realizedGainsPercent,
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
