/**
 * Closed-account status hooks.
 *
 * Closed accounts keep their history in analytics but stop being treated as
 * alive (no recurring/bill expectations, no card-limit config, omitted from
 * pickers). The toggle applies immediately -- it has backend side effects
 * (recurring deactivation) -- so it is not batched behind the Settings Save.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'
import { accountClassificationsService } from '@/services/api/accountClassifications'

const CLOSED_ACCOUNTS_KEY = ['account-classifications', 'closed'] as const

export function useClosedAccounts() {
  return useQuery({
    queryKey: CLOSED_ACCOUNTS_KEY,
    queryFn: accountClassificationsService.getClosedAccounts,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
  })
}

export function useSetAccountStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ accountName, isClosed }: { accountName: string; isClosed: boolean }) =>
      accountClassificationsService.setAccountStatus(accountName, isClosed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CLOSED_ACCOUNTS_KEY })
      // Recurring expectations flip server-side with the status change.
      queryClient.invalidateQueries({ queryKey: analyticsV2Keys.all })
    },
  })
}
