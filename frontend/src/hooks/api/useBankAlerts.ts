/**
 * Bank alerts matched against the ledger, and the ignore/restore write.
 *
 * Unlike the rest of the cache, this data changes with no action in the app:
 * a Shortcut posts new alerts to the server at any time. So the query keeps
 * `staleTime: Infinity` (no refetch on focus or re-render) but refetches each
 * time a reader mounts, showing the cached list meanwhile. An import already
 * clears or invalidates the whole cache, which re-runs the match.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'
import { BANK_ALERT_DAYS, bankAlertsService, type BankAlertList } from '@/services/api/bankAlerts'

export const BANK_ALERTS_KEY = ['bank-alerts'] as const

export const bankAlertKeys = {
  list: (days: number) => [...BANK_ALERTS_KEY, 'list', days] as const,
}

export function useBankAlerts(days: number = BANK_ALERT_DAYS) {
  return useQuery<BankAlertList, Error>({
    queryKey: bankAlertKeys.list(days),
    queryFn: () => bankAlertsService.list(days),
    staleTime: Infinity,
    refetchOnMount: 'always',
  })
}

interface IgnoreVariables {
  readonly id: number
  readonly ignored: boolean
}

/** Refetch every list, unless the session that started the write has ended. */
function refreshAlerts(queryClient: QueryClient, signal: AbortSignal | undefined) {
  if (!signal || !isCurrentSession(signal)) return
  void queryClient.invalidateQueries({ queryKey: BANK_ALERTS_KEY })
}

/**
 * Ignoring an alert also frees the ledger row it held, which can turn another
 * alert from missing to matched, so the list is refetched after the write.
 */
export function useSetBankAlertIgnored() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...BANK_ALERTS_KEY, 'ignore', getSessionGeneration()],
    mutationFn: ({ id, ignored }: IgnoreVariables) => {
      assertCurrentSession(sessionSignal)
      return bankAlertsService.setIgnored(id, ignored)
    },
    onMutate: () => sessionSignal,
    onSuccess: (result, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      // Show the change at once, even if the refetch below fails.
      queryClient.setQueriesData<BankAlertList>({ queryKey: BANK_ALERTS_KEY }, (list) =>
        list && {
          ...list,
          alerts: list.alerts.map((alert) =>
            alert.id === result.id
              ? { ...alert, status: result.ignored ? 'ignored' : 'missing' }
              : alert,
          ),
        })
      refreshAlerts(queryClient, signal)
    },
    // The panel reports the failure under the list, so skip the global toast.
    onError: (_error, _variables, signal) => refreshAlerts(queryClient, signal),
  })
}
