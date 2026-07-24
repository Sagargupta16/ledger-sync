import { useMemo, useState } from 'react'

import { usePreferences } from '@/hooks/api/usePreferences'
import { useTransactions } from '@/hooks/api/useTransactions'
import { computeGSTAnalysis, getExpenseFYs } from '@/lib/gstCalculator'
import { FY_START_MONTH } from '@/lib/taxCalculator'

export function useGSTAnalysis() {
  const transactionsQuery = useTransactions()
  const preferencesQuery = usePreferences()
  const fiscalYearStartMonth =
    preferencesQuery.data?.fiscal_year_start_month ?? FY_START_MONTH
  const [selectedFY, setSelectedFY] = useState<string | null>(null)

  const allFYs = useMemo(
    () => getExpenseFYs(transactionsQuery.data ?? [], fiscalYearStartMonth),
    [transactionsQuery.data, fiscalYearStartMonth],
  )
  const effectiveFY = selectedFY ?? allFYs[0] ?? ''

  const gstData = useMemo(
    () =>
      transactionsQuery.data && effectiveFY
        ? computeGSTAnalysis(transactionsQuery.data, effectiveFY, fiscalYearStartMonth)
        : null,
    [transactionsQuery.data, effectiveFY, fiscalYearStartMonth],
  )

  const taxableSlabs = useMemo(
    () => (gstData?.slabBreakdown ?? []).filter((slab) => slab.gstAmount > 0),
    [gstData],
  )

  const retry = () => {
    void Promise.all([transactionsQuery.refetch(), preferencesQuery.refetch()])
  }

  return {
    allFYs,
    effectiveFY,
    setSelectedFY,
    gstData,
    taxableSlabs,
    hasData: Boolean(gstData && gstData.totalSpending > 0),
    isLoading: transactionsQuery.isLoading || preferencesQuery.isLoading,
    isError: transactionsQuery.isError || preferencesQuery.isError,
    retry,
  }
}
