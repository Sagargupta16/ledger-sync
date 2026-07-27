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
 * The one fix for `rollups_stale`, and the only place in the app that offers it
 * outside the upload flow. An import that succeeds while its refresh fails is
 * not an error the user ever sees -- `upload.py` deliberately keeps the upload
 * green so committed rows are never rejected by a Neon statement timeout -- so
 * without a button here the only recovery is to re-upload the whole workbook.
 *
 * Invalidates all of `analyticsV2Keys.all` on success: every page reads these
 * rollups, so the numbers they hold in cache are exactly what just changed.
 */
function useRecomputeAnalytics() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => uploadService.refreshAnalytics(),
    onSuccess: async () => {
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
