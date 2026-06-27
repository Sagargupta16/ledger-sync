import { useQuery } from '@tanstack/react-query'

import { transactionsService, type TransactionFilters } from '@/services/api/transactions'

/**
 * Fetch the user's transactions.
 *
 * Account-level data filters (excluded accounts) are applied server-side --
 * see ``api/transactions.py::_base_transaction_query``.
 *
 * Earning-start-date is a **view** preference (chart x-axis lower bound) and
 * is intentionally NOT applied here -- consumers that need view-window
 * cropping should apply it at the chart/series level (see
 * ``useAnalyticsTimeFilter``).
 */
export function useTransactions(filters?: TransactionFilters) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => transactionsService.getTransactions(filters),
    // Transactions only change on upload (which invalidates this key).
    // Keep cached data fresh indefinitely to avoid refetching on navigation.
    staleTime: Infinity,
  })
}

/**
 * Fetch dropdown facets (distinct categories/accounts) and per-type counts
 * for the Transactions page. Server-aggregated, so it replaces pulling the
 * entire ledger into the browser just to derive these few values.
 */
export function useTransactionFacets() {
  return useQuery({
    queryKey: ['transaction-facets'],
    queryFn: () => transactionsService.getFacets(),
    staleTime: Infinity,
  })
}
