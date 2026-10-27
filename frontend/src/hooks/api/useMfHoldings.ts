/**
 * Mutual-fund holdings from an imported CAS, and the CAS import itself.
 *
 * The read follows the app-wide `staleTime: Infinity`: the server decides when
 * AMFI's NAVs are due (once a day after 10:30 IST), so a refetch is cheap and
 * the page offers one. The import follows the session-guard pattern: the
 * session is captured at render, asserted before dispatch and re-checked before
 * the cache is touched. It reports its own errors, so the global toast stays quiet.
 *
 * `onImported` is a hook-level callback on purpose: the import panel unmounts as
 * soon as the refetched holdings arrive, and a `mutate()`-level callback is
 * dropped once its observer is gone, so the caller keeps the result through this one.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  assertCurrentSession,
  getSessionGeneration,
  getSessionSignal,
  isCurrentSession,
} from '@/lib/session'
import { casService, type CasImportResult } from '@/services/api/cas'

export const mfHoldingsKeys = {
  all: ['mf-holdings'] as const,
}

export function useMfHoldings() {
  return useQuery({
    queryKey: mfHoldingsKeys.all,
    queryFn: () => casService.getHoldings(),
    staleTime: Infinity,
  })
}

export function useCasImport(onImported?: (result: CasImportResult) => void) {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...mfHoldingsKeys.all, 'import', getSessionGeneration()],
    // The variables hold the PDF password: drop the settled mutation at once
    // (the panel calls reset()) instead of keeping it for the default 5 minutes.
    gcTime: 0,
    mutationFn: ({ file, password }: { file: File; password: string }) => {
      assertCurrentSession(sessionSignal)
      return casService.importCas(file, password)
    },
    onMutate: () => sessionSignal,
    onSuccess: (result, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return undefined
      onImported?.(result)
      return queryClient.invalidateQueries({ queryKey: mfHoldingsKeys.all })
    },
    // The panel shows the server's reason (wrong password, MFCentral, re-print).
    onError: () => undefined,
  })
}
