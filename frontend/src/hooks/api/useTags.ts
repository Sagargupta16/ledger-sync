import { useMutation, useQueryClient } from '@tanstack/react-query'

import { transactionsService } from '@/services/api/transactions'
import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'

/**
 * Replace the full tag list on a transaction. Errors surface at call sites
 * via mutation state (sonner toast).
 */
export function useUpdateTransactionTags() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: ['transactions', 'tags', getSessionGeneration()],
    mutationFn: ({ transactionId, tags }: { transactionId: string; tags: string[] }) => {
      assertCurrentSession(sessionSignal)
      return transactionsService.updateTransactionTags(transactionId, tags)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      // Fire-and-forget: invalidateQueries resolves even if a refetch fails
      // (query-core swallows it), and the tag write itself surfaces via the
      // global MutationCache toast.
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['transactions-page'] })
      void queryClient.invalidateQueries({ queryKey: ['transaction-facets'] })
    },
  })
}
