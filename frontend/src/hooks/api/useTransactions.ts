import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { transactionsService, type TransactionFilters } from '@/services/api/transactions'
import { usePreferences } from './usePreferences'
import { usePreferencesStore } from '@/store/preferencesStore'

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

/**
 * Check whether a date string represents a valid date (YYYY-MM-DD or similar).
 */
function isValidDateString(s: string | null | undefined): s is string {
  if (!s || typeof s !== 'string') return false
  const d = new Date(s)
  return !Number.isNaN(d.getTime())
}

export function useTransactions(filters?: TransactionFilters) {
  const { data: preferences } = usePreferences()
  const earningStartDate = usePreferencesStore((s) => s.earningStartDate)
  const useEarningStartDate = usePreferencesStore((s) => s.useEarningStartDate)

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

  // Resolve the effective earning start date cutoff (if enabled and valid)
  const earningCutoff = useMemo(() => {
    if (!useEarningStartDate || !isValidDateString(earningStartDate)) return null
    // Normalize to YYYY-MM-DD for string comparison with tx.date
    return earningStartDate.substring(0, 10)
  }, [useEarningStartDate, earningStartDate])

  const filteredData = useMemo(() => {
    if (!query.data) return query.data
    if (excludedAccounts.size === 0 && !earningCutoff) return query.data
    return query.data.filter((tx) => {
      // Exclude transactions from excluded accounts
      const account = tx.account?.toLowerCase()
      if (account && excludedAccounts.has(account)) return false
      // Exclude transactions before the earning start date
      if (earningCutoff && tx.date < earningCutoff) return false
      return true
    })
  }, [query.data, excludedAccounts, earningCutoff])

  return {
    ...query,
    data: filteredData,
  }
}
