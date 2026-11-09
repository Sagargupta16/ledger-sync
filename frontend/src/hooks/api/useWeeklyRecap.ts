/**
 * Weekly recap hooks: the deterministic recap query and its optional AI
 * explanation (`services/api/weeklyRecap.ts`).
 */

import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query'
import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'
import { getTodayKey } from '@/lib/dateUtils'
import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'
import { aiUnavailableReason, isAiReady, useAiAvailability } from '@/hooks/api/useAiAvailability'
import { weeklyRecapService, type WeeklyRecap } from '@/services/api/weeklyRecap'
import { useDemoStore } from '@/store/demoStore'

export const weeklyRecapKeys = {
  /**
   * Under the analyticsV2 `anomalies` prefix, like `anomalyCounts`: an upload,
   * a preference save, a recurring edit and an anomaly review each invalidate
   * that prefix, and each changes the recap. So does the IST day: the bills
   * window, days to payday and, on Monday, the week itself move at midnight
   * with no other event, and staleTime is Infinity.
   */
  recap: (day: string) => [...analyticsV2Keys.all, 'anomalies', 'weekly-recap', day] as const,
  /** Keyed by the exact facts, so a recap that changes drops the summary of the old one. */
  explain: (facts: string) => ['weekly-recap', 'explain', getSessionGeneration(), facts] as const,
}

export function useWeeklyRecap() {
  const day = getTodayKey()
  return useQuery<WeeklyRecap, Error>({
    queryKey: weeklyRecapKeys.recap(day),
    queryFn: () => weeklyRecapService.get(),
    staleTime: Infinity,
  })
}

/**
 * An explanation stays readable for an hour after the card unmounts, as long
 * as a cached query, so coming back to the Dashboard does not spend another
 * call. A session change clears the mutation cache with everything else.
 */
const EXPLANATION_GC_MS = 60 * 60 * 1000

interface ExplainRun {
  status: 'idle' | 'pending' | 'success' | 'error'
  text: string | null
  error: Error | null
}

export function useExplainWeeklyRecap(facts: string) {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  // The chat widget's rule, from one derivation: an unknown or failed config
  // never falls back to app mode, so a BYOK user's call cannot spend the shared quota.
  const availability = useAiAvailability()
  const isConfigured = isAiReady(availability)
  const isConfigLoading = availability.kind === 'loading'

  // Any settled call may have used quota, so the usage badge refreshes either way.
  const refreshUsage = (signal: AbortSignal | undefined) => {
    if (signal && isCurrentSession(signal)) void queryClient.invalidateQueries({ queryKey: ['ai-usage'] })
  }

  const mutationKey = weeklyRecapKeys.explain(facts)
  const mutation = useMutation({
    mutationKey,
    gcTime: EXPLANATION_GC_MS,
    mutationFn: (text: string) => {
      assertCurrentSession(sessionSignal)
      if (availability.kind !== 'app' && availability.kind !== 'byok_ready') {
        throw new Error(aiUnavailableReason(availability) ?? 'AI is not available')
      }
      return weeklyRecapService.explain(text, availability, sessionSignal)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_text, _facts, signal) => refreshUsage(signal),
    // Shown inline under the button; defining onError also skips the global toast.
    onError: (_error, _facts, signal) => refreshUsage(signal),
  })

  // Every run for these facts, oldest first, read from the cache rather than
  // the observer: a remounted card has a fresh observer, while the cache keeps
  // a finished run for EXPLANATION_GC_MS.
  const runs = useMutationState({
    filters: { mutationKey },
    select: (entry): ExplainRun => ({
      status: entry.state.status,
      text: typeof entry.state.data === 'string' ? entry.state.data : null,
      error: entry.state.error,
    }),
  })
  const latest = runs.at(-1)

  return {
    explain: () => mutation.mutate(facts),
    narrative: runs.findLast((run) => run.text !== null)?.text ?? null,
    isPending: latest?.status === 'pending',
    error: latest?.status === 'error' ? latest.error : null,
    isConfigLoading,
    isConfigured,
    isDemoMode,
    /** Why Explain is unavailable (config loading, failed, or incomplete); null when ready. */
    unavailableReason: aiUnavailableReason(availability),
    /** Set only when the settings failed to load; call to refetch. */
    retryConfig: availability.kind === 'error' ? availability.retry : null,
    /** BYOK without a usable key or model, so Settings is the fix. */
    needsSetup: availability.kind === 'byok_needs_key' || availability.kind === 'byok_incomplete',
  }
}
