import { useMutation, useQueryClient } from '@tanstack/react-query'
import { moneyManagerBackupService, type MoneyManagerImportParams } from '@/services/api/moneyManagerBackup'
import { prefetchCoreData } from '@/lib/prefetch'
import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'

/**
 * Dry-run or import a gzipped Money Manager backup. Only a saved import
 * replaces the ledger, so only that clears and rewarms the caches.
 */
export function useMoneyManagerUpload() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: ['upload', 'money-manager', getSessionGeneration()],
    mutationFn: (params: MoneyManagerImportParams) => {
      assertCurrentSession(sessionSignal)
      return moneyManagerBackupService.importBackup(params)
    },
    onMutate: () => sessionSignal,
    onSuccess: (result, _variables, signal) => {
      if (!signal || !isCurrentSession(signal) || result.status !== 'imported') return
      queryClient.clear()
      prefetchCoreData()
    },
    // The Upload page reports each failure itself, so skip the global toast.
    onError: () => undefined,
  })
}
