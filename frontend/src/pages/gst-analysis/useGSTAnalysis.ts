import { useMemo, useState } from 'react'

import { usePreferences } from '@/hooks/api/usePreferences'
import { useTransactions } from '@/hooks/api/useTransactions'
import { getDateKey, getTodayKey } from '@/lib/dateUtils'
import { capitalLossConfig, isCapitalLoss } from '@/lib/expenseClassification'
import { computeGSTAnalysis, getExpenseFYs } from '@/lib/gstCalculator'
import { pageStatus, retryFailed } from '@/lib/queryStatus'
import { FY_START_MONTH } from '@/lib/taxCalculator'

export function useGSTAnalysis() {
  const transactionsQuery = useTransactions()
  const preferencesQuery = usePreferences()
  const fiscalYearStartMonth =
    preferencesQuery.data?.fiscal_year_start_month ?? FY_START_MONTH
  const [selectedFY, setSelectedFY] = useState<string | null>(null)

  const lossCategories = preferencesQuery.data?.capital_loss_categories
  const lossConfig = useMemo(() => capitalLossConfig(lossCategories), [lossCategories])
  // GST is paid on purchases that have happened: a classified realised loss bought
  // nothing, and a row dated after today is not spending yet.
  const purchases = useMemo(() => {
    if (!transactionsQuery.data) return undefined
    const today = getTodayKey()
    return transactionsQuery.data.filter(
      (tx) => tx.type !== 'Expense' || (getDateKey(tx.date) <= today && !isCapitalLoss(tx, lossConfig)),
    )
  }, [transactionsQuery.data, lossConfig])

  const allFYs = useMemo(
    () => getExpenseFYs(purchases ?? [], fiscalYearStartMonth),
    [purchases, fiscalYearStartMonth],
  )
  const effectiveFY = selectedFY ?? allFYs[0] ?? ''

  const gstData = useMemo(
    () =>
      purchases && effectiveFY
        ? computeGSTAnalysis(purchases, effectiveFY, fiscalYearStartMonth)
        : null,
    [purchases, effectiveFY, fiscalYearStartMonth],
  )

  const taxableSlabs = useMemo(
    () => (gstData?.slabBreakdown ?? []).filter((slab) => slab.gstAmount > 0),
    [gstData],
  )

  const reads = [transactionsQuery, preferencesQuery]
  const status = pageStatus(reads)
  const retry = () => void retryFailed(reads)

  return {
    allFYs,
    effectiveFY,
    setSelectedFY,
    gstData,
    taxableSlabs,
    hasData: Boolean(gstData && gstData.totalSpending > 0),
    isLoading: status.kind === 'loading',
    isError: status.kind === 'error',
    refreshFailed: status.kind === 'ready' && status.refreshFailed,
    retry,
  }
}
