/**
 * Closed-account status hooks.
 *
 * Closed accounts keep their history in analytics but stop being treated as
 * alive (no recurring/bill expectations, no card-limit config, omitted from
 * pickers). The toggle applies immediately -- it has backend side effects
 * (recurring deactivation) -- so it is not batched behind the Settings Save.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { invalidatePreferenceDependents } from '@/hooks/api/usePreferences'
import { accountClassificationsService } from '@/services/api/accountClassifications'
import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'

const CLOSED_ACCOUNTS_KEY = ['account-classifications', 'closed'] as const

export function useClosedAccounts() {
  return useQuery({
    queryKey: CLOSED_ACCOUNTS_KEY,
    queryFn: () => accountClassificationsService.getClosedAccounts(),
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
  })
}

export function useSetAccountStatus() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()
  return useMutation({
    mutationKey: ['account-classifications', 'status', getSessionGeneration()],
    mutationFn: ({ accountName, isClosed }: { accountName: string; isClosed: boolean }) => {
      assertCurrentSession(sessionSignal)
      return accountClassificationsService.setAccountStatus(accountName, isClosed)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => {
      if (signal && isCurrentSession(signal)) {
        void invalidatePreferenceDependents(queryClient, false)
      }
    },
  })
}
