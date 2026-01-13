import { useQuery } from '@tanstack/react-query'
import { transactionsService } from '@/services/api/transactions'

export function useTransactions() {
  return useQuery({
    queryKey: ['transactions'],
    queryFn: () => transactionsService.getTransactions(),
  })
}
