/**
 * Account classifications query hook.
 *
 * Returns the user's account -> category map (e.g. "SBI Savings" ->
 * "Bank Accounts"). Used by the financial health score to tell liquid
 * balances (bank/cash/wallets) apart from investment and liability accounts.
 * Cached like the rest of the analytics data (staleTime Infinity; the cache
 * clears on upload / settings save).
 */

import { useQuery } from '@tanstack/react-query'

import { accountClassificationsService } from '@/services/api/accountClassifications'

const ACCOUNT_CLASSIFICATIONS_KEY = ['account-classifications', 'all'] as const

export function useAccountClassifications() {
  return useQuery({
    queryKey: ACCOUNT_CLASSIFICATIONS_KEY,
    queryFn: accountClassificationsService.getAllClassifications,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
  })
}
