import { useQuery } from '@tanstack/react-query'
import { transactionsService, type TransactionFilters } from '@/services/api/transactions'

export function useTransactions(filters?: TransactionFilters) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => transactionsService.getTransactions(filters),
  })
}
