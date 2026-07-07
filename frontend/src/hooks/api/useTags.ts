import { useMutation, useQueryClient } from '@tanstack/react-query'

import { transactionsService } from '@/services/api/transactions'

/**
 * Replace the full tag list on a transaction. Errors surface at call sites
 * via mutation state (sonner toast).
 */
export function useUpdateTransactionTags() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ transactionId, tags }: { transactionId: string; tags: string[] }) =>
      transactionsService.updateTransactionTags(transactionId, tags),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['transactions-page'] })
      queryClient.invalidateQueries({ queryKey: ['transaction-facets'] })
    },
  })
}
