/**
 * The `/api/analytics/v2/data-health` query, shared by the Data Health page and
 * the global staleness alert.
 *
 * It lives in `hooks/api/` rather than inside the page directory because the app
 * shell needs it too: a user reading a wrong number on Dashboard has no reason
 * to navigate to Data Health, so the warning has to travel to them. Pages do not
 * import from other pages, so the query moved here instead.
 */

import { useQuery } from '@tanstack/react-query'

import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'
import { analyticsV2Service, type DataHealth } from '@/services/api/analyticsV2'

/**
 * Nested under `analyticsV2Keys.all` so the post-upload
 * `invalidateQueries({ queryKey: analyticsV2Keys.all })` sweep refreshes this
 * too -- an import is exactly the event that changes these numbers.
 *
 * The endpoint takes no params, so the key takes none either; if a param is ever
 * added it MUST be threaded through here (staleTime is Infinity, so a param
 * missing from the key means two callers silently share one cache entry).
 */
export const dataHealthKeys = {
  all: [...analyticsV2Keys.all, 'data-health'] as const,
  summary: () => [...dataHealthKeys.all] as const,
}

export function useDataHealthQuery() {
  return useQuery<DataHealth, Error>({
    queryKey: dataHealthKeys.summary(),
    queryFn: () => analyticsV2Service.getDataHealth(),
    staleTime: Infinity,
  })
}
