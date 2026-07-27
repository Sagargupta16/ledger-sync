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
      // Fire-and-forget: invalidateQueries resolves even if a refetch fails
      // (query-core swallows it), and the tag write itself surfaces via the
      // global MutationCache toast.
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['transactions-page'] })
      void queryClient.invalidateQueries({ queryKey: ['transaction-facets'] })
    },
  })
}
