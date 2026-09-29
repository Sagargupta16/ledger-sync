import { queryOptions, useQuery } from '@tanstack/react-query'

import { earningStartEvidenceOptions } from '@/hooks/api/useAnalytics'
import { calculationsApi, type DateRangeParams } from '@/services/api/calculations'

/**
 * `/daily-net-worth` for a window. Under the `calculations` family so every
 * preference save (excluded accounts included) and every upload refreshes it.
 * The all-time slot (no params) is shared by Net Worth and Trends.
 */
export const dailyNetWorthOptions = (params?: DateRangeParams) =>
  queryOptions({
    queryKey: ['calculations', 'daily-net-worth', params] as const,
    queryFn: async () => (await calculationsApi.getDailyNetWorth(params)).data,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

export const useDailyNetWorth = (params?: DateRangeParams) => useQuery(dailyNetWorthOptions(params))

/**
 * Daily income sums per (category, subcategory) for `resolveEarningStart`,
 * sharing the Dashboard's cache entry. Pass `enabled: false` once a saved
 * employment start makes the evidence irrelevant.
 */
export const useEarningStartEvidence = (enabled: boolean) =>
  useQuery({ ...earningStartEvidenceOptions(), enabled })
