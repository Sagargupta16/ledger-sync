/**
 * RSU tax records and the foreign-asset reports. Every write refetches the
 * whole `rsu-tax` family, because a vest's rupee value, a sale or a dividend
 * changes the lot ledger, Schedule FA and FAST-DS together.
 *
 * Mutations set their own `onError`, so the caller shows the failure next to
 * the form instead of the global toast. Demo mode blocks every write in the
 * API client; the screens disable their write controls there.
 */

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'

import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'
import {
  rsuTaxService,
  type ForeignAssetEventInput,
  type ForeignAssetEventLink,
  type VestFxInput,
} from '@/services/api/rsuTax'

export const RSU_TAX_KEY = ['rsu-tax'] as const

/** Refetch everything derived from these records, unless the writing session has ended. */
function refreshRsuTax(queryClient: QueryClient, signal: AbortSignal | undefined) {
  if (!signal || !isCurrentSession(signal)) return
  void queryClient.invalidateQueries({ queryKey: RSU_TAX_KEY })
}

export function useVestFx(enabled = true) {
  return useQuery({
    queryKey: [...RSU_TAX_KEY, 'vest-fx'],
    queryFn: () => rsuTaxService.listVestFx(),
    staleTime: Infinity,
    enabled,
  })
}

export function useForeignAssetLots() {
  return useQuery({
    queryKey: [...RSU_TAX_KEY, 'lots'],
    queryFn: () => rsuTaxService.getLots(),
    staleTime: Infinity,
  })
}

/** Keeps the previous year on screen while another year's market data loads. */
export function useScheduleFa(year: number | null) {
  return useQuery({
    queryKey: [...RSU_TAX_KEY, 'schedule-fa', year],
    queryFn: () => rsuTaxService.getScheduleFa(year ?? 0),
    enabled: year != null,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  })
}

export function useFastDs(enabled = true) {
  return useQuery({
    queryKey: [...RSU_TAX_KEY, 'fast-ds'],
    queryFn: () => rsuTaxService.getFastDs(),
    staleTime: Infinity,
    enabled,
  })
}

export function useSaveVestFx() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...RSU_TAX_KEY, 'save-vest-fx', getSessionGeneration()],
    mutationFn: ({ vestingId, input }: { vestingId: string; input: VestFxInput }) => {
      assertCurrentSession(sessionSignal)
      return rsuTaxService.saveVestFx(vestingId, input)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => refreshRsuTax(queryClient, signal),
    onError: (_error, _variables, signal) => refreshRsuTax(queryClient, signal),
  })
}

export function useDeleteVestFx() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...RSU_TAX_KEY, 'delete-vest-fx', getSessionGeneration()],
    mutationFn: (vestingId: string) => {
      assertCurrentSession(sessionSignal)
      return rsuTaxService.deleteVestFx(vestingId)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => refreshRsuTax(queryClient, signal),
    onError: (_error, _variables, signal) => refreshRsuTax(queryClient, signal),
  })
}

export function useCreateForeignAssetEvent() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...RSU_TAX_KEY, 'create-event', getSessionGeneration()],
    mutationFn: (input: ForeignAssetEventInput) => {
      assertCurrentSession(sessionSignal)
      return rsuTaxService.createEvent(input)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => refreshRsuTax(queryClient, signal),
    onError: (_error, _variables, signal) => refreshRsuTax(queryClient, signal),
  })
}

/** Re-link a sale to its vest, or a dividend to the stock that paid it. */
export function useLinkForeignAssetEvent() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...RSU_TAX_KEY, 'link-event', getSessionGeneration()],
    mutationFn: ({ eventId, link }: { eventId: number; link: ForeignAssetEventLink }) => {
      assertCurrentSession(sessionSignal)
      return rsuTaxService.linkEvent(eventId, link)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => refreshRsuTax(queryClient, signal),
    onError: (_error, _variables, signal) => refreshRsuTax(queryClient, signal),
  })
}

export function useDeleteForeignAssetEvent() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...RSU_TAX_KEY, 'delete-event', getSessionGeneration()],
    mutationFn: (eventId: number) => {
      assertCurrentSession(sessionSignal)
      return rsuTaxService.deleteEvent(eventId)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => refreshRsuTax(queryClient, signal),
    onError: (_error, _variables, signal) => refreshRsuTax(queryClient, signal),
  })
}
