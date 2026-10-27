import { queryOptions } from '@tanstack/react-query'

import type { DateRangeParams } from '@/services/api/calculations'
import { dashboardMetricsApi } from '@/services/api/dashboardMetrics'

/**
 * Query options for `/api/dashboard-metrics`, the figures the Dashboard used to
 * derive from the whole ledger. Both keys sit under the `calculations` family,
 * so every preference, classification and account-status save invalidates them
 * with the other figures (`invalidatePreferenceDependents`); an upload clears
 * the whole cache.
 */

/** Age of Money, Days of Buffering and the investment-transfer split for a window. */
export const dashboardPulseOptions = (params: DateRangeParams) =>
  queryOptions({
    queryKey: ['calculations', 'dashboard-metrics', 'pulse', params] as const,
    queryFn: () => dashboardMetricsApi.getPulse(params),
    staleTime: Infinity,
  })

/** Current health over the whole ledger; no window changes it. */
export const dashboardHealthOptions = () =>
  queryOptions({
    queryKey: ['calculations', 'dashboard-metrics', 'health'] as const,
    queryFn: () => dashboardMetricsApi.getHealth(),
    staleTime: Infinity,
  })
