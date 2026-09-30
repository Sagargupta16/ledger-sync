/**
 * Warm the small queries used throughout the authenticated workspace.
 * Page-specific data, including the full ledger, loads with its consumer.
 */

import { queryClient } from './queryClient'
import { preferencesService } from '@/services/api/preferences'
import { analyticsV2Service } from '@/services/api/analyticsV2'
import { RECURRING_COMMITMENTS_PARAMS } from '@/hooks/api/recurringCommitmentsParams'
import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'
import { dataHealthKeys } from '@/hooks/api/useDataHealthQuery'
import { useAuthStore } from '@/store/authStore'
import { isDemoMode } from '@/store/demoStore'

export function prefetchCoreData() {
  const { isAuthenticated, isLoading } = useAuthStore.getState()
  if (!isAuthenticated || isLoading || isDemoMode()) return

  // TanStack deduplicates these with the mounted workspace readers.
  void queryClient.prefetchQuery({
    queryKey: ['preferences'],
    queryFn: () => preferencesService.getPreferences(),
  })

  // The shared params object the Dashboard, Sidebar, notification centre and
  // Bill Calendar read, so this warms the one cache entry they all share.
  void queryClient.prefetchQuery({
    queryKey: analyticsV2Keys.recurringTransactions(RECURRING_COMMITMENTS_PARAMS),
    queryFn: () => analyticsV2Service.getRecurringTransactions(RECURRING_COMMITMENTS_PARAMS),
  })

  void queryClient.prefetchQuery({
    queryKey: dataHealthKeys.summary(),
    queryFn: () => analyticsV2Service.getDataHealth(),
  })
}
