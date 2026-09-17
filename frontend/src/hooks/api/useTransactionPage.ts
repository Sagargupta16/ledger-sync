import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

import {
  transactionsService, type PaginatedResponse, type TransactionFilters,
} from '@/services/api/transactions'
import type { Transaction } from '@/types'

type PageFilters = Omit<TransactionFilters, 'cursor'> & { limit: number; offset: number }

/**
 * Numbered pages keep their logical offset cache keys. A fresh preceding date
 * page supplies the seek cursor; uncached jumps and other sorts use offsets.
 * Keeping cursors inside the query data makes existing transaction invalidation,
 * session clearing, and filter/sort/page-size keys apply to them as well.
 */
export function useTransactionPage(filters: PageFilters) {
  const client = useQueryClient()
  const queryKey = ['transactions-page', filters]
  return useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const previous = client.getQueryState<PaginatedResponse<Transaction>>([
        'transactions-page', { ...filters, offset: filters.offset - filters.limit },
      ])
      const refreshing = client.getQueryState(queryKey)?.isInvalidated
      const cursor = !refreshing
        && (filters.sort ?? 'date') === 'date'
        && filters.offset >= filters.limit
        && previous?.status === 'success'
        && previous.fetchStatus === 'idle'
        && !previous.isInvalidated
        && previous.data?.has_more
        && previous.data.next_cursor

      if (cursor) {
        const seekFilters: TransactionFilters = { ...filters, cursor }
        delete seekFilters.offset
        try {
          return await transactionsService.getTransactionsPaginated(
            seekFilters, signal,
          )
        } catch (error) {
          // A changed server-side filter or signing key can reject a previously
          // valid cursor. Recover the numbered page once via its normal offset.
          if (!isAxiosError(error) || error.response?.status !== 422) throw error
        }
      }
      return transactionsService.getTransactionsPaginated(filters, signal)
    },
    staleTime: Infinity,
  })
}
