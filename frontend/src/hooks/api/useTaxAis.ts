/**
 * AIS totals saved per tax year: the TDS on salary, other TDS, interest and
 * dividends /tax/ais computed in the browser. Writes publish the server's
 * answer into the year's cache entry and refresh the list, unless the session
 * that started them has ended.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'
import { taxAisService, type TaxAisSummary, type TaxAisTotals } from '@/services/api/taxAis'

const TAX_AIS_KEY = ['tax-ais'] as const
const listKey = [...TAX_AIS_KEY, 'list'] as const
const yearKey = (taxYear: string) => [...TAX_AIS_KEY, 'year', taxYear] as const

function publish(
  queryClient: QueryClient,
  signal: AbortSignal | undefined,
  taxYear: string,
  saved: TaxAisSummary | null,
) {
  if (!signal || !isCurrentSession(signal)) return
  queryClient.setQueryData(yearKey(taxYear), saved)
  void queryClient.invalidateQueries({ queryKey: listKey })
}

/** Every tax year with saved AIS totals, newest first. */
export function useTaxAisSummaries() {
  return useQuery({
    queryKey: listKey,
    queryFn: () => taxAisService.list(),
    staleTime: Infinity,
  })
}

/** One tax year's saved totals ("2025-26"); null when none were imported. */
export function useTaxAisSummary(taxYear: string | null) {
  return useQuery({
    queryKey: yearKey(taxYear ?? ''),
    queryFn: () => taxAisService.get(taxYear ?? ''),
    enabled: Boolean(taxYear),
    staleTime: Infinity,
  })
}

export function useSaveTaxAisSummary() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...TAX_AIS_KEY, 'save', getSessionGeneration()],
    mutationFn: ({ taxYear, totals }: { taxYear: string; totals: TaxAisTotals }) => {
      assertCurrentSession(sessionSignal)
      return taxAisService.save(taxYear, totals)
    },
    onMutate: () => sessionSignal,
    onSuccess: (saved, { taxYear }, signal) => publish(queryClient, signal, taxYear, saved),
  })
}

export function useDeleteTaxAisSummary() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...TAX_AIS_KEY, 'delete', getSessionGeneration()],
    mutationFn: (taxYear: string) => {
      assertCurrentSession(sessionSignal)
      return taxAisService.remove(taxYear)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, taxYear, signal) => publish(queryClient, signal, taxYear, null),
  })
}
