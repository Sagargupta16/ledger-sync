import { useQuery } from '@tanstack/react-query'
import { transactionsService, type TransactionFilters } from '@/services/api/transactions'

export function useTransactions(filters?: TransactionFilters) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => transactionsService.getTransactions(filters),
    // Transactions only change on upload (which invalidates this key).
    // Keep cached data fresh indefinitely to avoid refetching on navigation.
    staleTime: Infinity,
  })
}
