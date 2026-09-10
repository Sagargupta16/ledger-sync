/**
 * Data + derived state for the Data Health page.
 *
 * Reads the server-side `/api/analytics/v2/data-health` rollup and turns it into
 * the freshness verdict, coverage span, quality issues, and last-import ledger
 * the page renders. No client-side ledger scan -- the whole point of this page
 * is to be cheap enough to open the moment something looks wrong.
 */

import { useMemo } from 'react'

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'
import { useDataHealthQuery } from '@/hooks/api/useDataHealthQuery'
import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'
import { uploadService } from '@/services/api/upload'

import {
  assessFreshness,
  buildCoverage,
  buildImportLedger,
  buildQualityIssues,
  isEmptyLedger,
} from './dataHealthUtils'

/**
 * Rebuild the pre-aggregated tables from the raw transactions.
 *
 * This is also available from the upload result when the ledger is saved but
 * its analytics refresh fails. Either entry point retries only the rollups,
 * preserving the already committed ledger.
 *
 * Invalidates all of `analyticsV2Keys.all` on success: every page reads these
 * rollups, so the numbers they hold in cache are exactly what just changed.
 */
function useRecomputeAnalytics() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()
  return useMutation({
    mutationKey: [...analyticsV2Keys.all, 'refresh', getSessionGeneration()],
    mutationFn: () => {
      assertCurrentSession(sessionSignal)
      return uploadService.refreshAnalytics()
    },
    onMutate: () => sessionSignal,
    onSuccess: async (_data, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      await queryClient.invalidateQueries({ queryKey: analyticsV2Keys.all })
    },
  })
}

export function useDataHealth() {
  const query = useDataHealthQuery()
  const recompute = useRecomputeAnalytics()
  const health = query.data

  const derived = useMemo(() => {
    if (!health) return null
    return {
      freshness: assessFreshness(health),
      coverage: buildCoverage(health),
      issues: buildQualityIssues(health),
      importLedger: buildImportLedger(health),
      isEmpty: isEmptyLedger(health),
    }
  }, [health])

  return {
    health,
    ...(derived ?? {
      freshness: null,
      coverage: null,
      issues: [],
      importLedger: [],
      isEmpty: false,
    }),
    isLoading: query.isPending,
    isError: query.isError,
    isRefetching: query.isRefetching,
    retry: () => {
      void query.refetch()
    },
    // Only the stale-rollups issue carries an action today; keyed by issue id so
    // the list disables the right button rather than all of them, and reports the
    // failure under the row that failed rather than under every unclean check.
    pendingActionId: recompute.isPending ? 'stale-rollups' : null,
    failedActionId: recompute.isError ? 'stale-rollups' : null,
    runIssueAction: (issueId: string) => {
      if (issueId === 'stale-rollups') recompute.mutate()
    },
  }
}
