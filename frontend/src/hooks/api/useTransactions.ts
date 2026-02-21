import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { transactionsService, type TransactionFilters } from '@/services/api/transactions'
import { usePreferences } from './usePreferences'

/**
 * Parse excluded_accounts from preferences (may be JSON string or array).
 */
function parseExcludedAccounts(raw: string[] | string | undefined): Set<string> {
  if (!raw) return new Set()
  let arr: string[]
  if (Array.isArray(raw)) {
    arr = raw
  } else {
    try {
      const parsed = JSON.parse(raw)
      arr = Array.isArray(parsed) ? parsed : []
    } catch {
      arr = []
    }
  }
  return new Set(arr.map((a) => a.toLowerCase()))
}

export function useTransactions(filters?: TransactionFilters) {
  const { data: preferences } = usePreferences()

  const query = useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => transactionsService.getTransactions(filters),
    // Transactions only change on upload (which invalidates this key).
    // Keep cached data fresh indefinitely to avoid refetching on navigation.
    staleTime: Infinity,
  })

  // Filter out transactions from excluded accounts before returning
  const excludedAccounts = useMemo(
    () => parseExcludedAccounts(preferences?.excluded_accounts),
    [preferences?.excluded_accounts],
  )

  const filteredData = useMemo(() => {
    if (!query.data || excludedAccounts.size === 0) return query.data
    return query.data.filter((tx) => {
      const account = tx.account?.toLowerCase()
      if (account && excludedAccounts.has(account)) return false
      return true
    })
  }, [query.data, excludedAccounts])

  return {
    ...query,
    data: filteredData,
  }
}
