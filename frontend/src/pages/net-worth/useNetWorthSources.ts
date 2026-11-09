import { useMemo } from 'react'

import { useAccountBalances, useDataDateRange } from '@/hooks/api/useAnalytics'
import { useDailyNetWorth } from '@/hooks/api/useCalculations'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useAccountClassifications } from '@/hooks/api/useAccountClassifications'
import { blockingError, refreshFailed, retryFailed } from '@/lib/queryStatus'

/**
 * The Net Worth page's five queries and their shared loading, error and retry
 * state. Balances are read at `ledgerToday`, the day the trend stops at, because
 * unbounded balances summed forward-dated accruals the capped trend omits.
 */
export function useNetWorthSources(ledgerToday: string) {
  const dateParams = { end_date: ledgerToday }
  const balancesQuery = useAccountBalances(dateParams)
  // All-time daily cash flow (server-aggregated) instead of the full ledger.
  const dailyQuery = useDailyNetWorth()
  // Same non-deleted, non-excluded rows as the ledger, so identical nav bounds.
  const dateRangeQuery = useDataDateRange()
  const preferencesQuery = usePreferences()
  const classificationsQuery = useAccountClassifications()

  const dailyCashFlow = useMemo(
    () => dailyQuery.data?.cumulative_data ?? [],
    [dailyQuery.data],
  )
  const { minDate, maxDate } = dateRangeQuery
  const dateBounds = useMemo(() => ({ minDate, maxDate }), [minDate, maxDate])
  const classifications = useMemo(
    () => classificationsQuery.data ?? {},
    [classificationsQuery.data],
  )
  const accounts = useMemo(() => balancesQuery.data?.accounts ?? {}, [balancesQuery.data?.accounts])
  const investmentMappings = useMemo(
    () => preferencesQuery.data?.investment_account_mappings ?? {},
    [preferencesQuery.data?.investment_account_mappings],
  )

  // `useDataDateRange` exposes the bounds, not the query's data: a ledger with
  // rows has a min date, which is what "this read has something to show" means.
  const dateRangeRead = { data: minDate ?? maxDate, isError: dateRangeQuery.isError, refetch: dateRangeQuery.refetch }
  const queries = [balancesQuery, dailyQuery, dateRangeQuery, preferencesQuery, classificationsQuery]
  const statusReads = [balancesQuery, dailyQuery, dateRangeRead, preferencesQuery, classificationsQuery]
  return {
    isLoading: queries.some((query) => query.isLoading),
    // Only a read with nothing to show blocks the page; one that failed but
    // kept its data raises `refreshFailed`.
    isError: blockingError(statusReads),
    refreshFailed: refreshFailed(statusReads),
    retry: () => {
      void retryFailed(statusReads)
    },
    accounts,
    dailyCashFlow,
    dateBounds,
    classifications,
    investmentMappings,
  }
}
