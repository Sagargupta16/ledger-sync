/**
 * Old-regime deductions saved per tax year, so the /tax regime comparison keeps
 * them between visits. Writes publish the server's answer into the year's cache
 * entry instead of refetching it.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'
import {
  taxDeductionsService,
  type SavedTaxDeductions,
  type TaxDeductionAmounts,
} from '@/services/api/taxDeductions'

const TAX_DEDUCTIONS_KEY = ['tax-deductions'] as const

const yearQueryKey = (taxYear: string) => [...TAX_DEDUCTIONS_KEY, taxYear] as const

/** Store a write's result, unless the session that started it has ended. */
async function publish(queryClient: QueryClient, signal: AbortSignal | undefined, saved: SavedTaxDeductions) {
  if (!signal || !isCurrentSession(signal)) return
  const queryKey = yearQueryKey(saved.tax_year)
  // A read still in flight holds older amounts; stop it landing over this answer.
  await queryClient.cancelQueries({ queryKey })
  if (isCurrentSession(signal)) queryClient.setQueryData(queryKey, saved)
}

/** The amounts saved for one tax year, such as "2026-27". */
export function useTaxDeductions(taxYear: string) {
  return useQuery({
    queryKey: yearQueryKey(taxYear),
    queryFn: () => taxDeductionsService.get(taxYear),
    staleTime: Infinity,
  })
}

export function useSaveTaxDeductions() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...TAX_DEDUCTIONS_KEY, 'save', getSessionGeneration()],
    mutationFn: ({ taxYear, changes }: { taxYear: string; changes: TaxDeductionAmounts }) => {
      assertCurrentSession(sessionSignal)
      return taxDeductionsService.save(taxYear, changes)
    },
    onMutate: () => sessionSignal,
    onSuccess: (saved, _variables, signal) => publish(queryClient, signal, saved),
  })
}

export function useClearTaxDeductions() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...TAX_DEDUCTIONS_KEY, 'clear', getSessionGeneration()],
    mutationFn: (taxYear: string) => {
      assertCurrentSession(sessionSignal)
      return taxDeductionsService.clear(taxYear)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, taxYear, signal) =>
      publish(queryClient, signal, { tax_year: taxYear, deductions: {} }),
  })
}
