/**
 * Weekly recap hooks: the deterministic recap query and its optional AI
 * explanation (`services/api/weeklyRecap.ts`).
 */

import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query'
import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'
import { getTodayKey } from '@/lib/dateUtils'
import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'
import { aiConfigService } from '@/services/api/aiConfig'
import { weeklyRecapService, type WeeklyRecap } from '@/services/api/weeklyRecap'
import { useAuthStore } from '@/store/authStore'
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
  const accessToken = useAuthStore((state) => state.accessToken)
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  // The chat widget's key and options, so both read one cache entry. The
  // server still applies the stored mode, so the config only picks the transport.
  const { data: aiConfig, isLoading: isConfigLoading } = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => aiConfigService.getConfig(),
    enabled: !!accessToken && !isDemoMode,
    staleTime: Infinity,
  })
  // The chat widget's rule: app mode needs no key, BYOK needs a stored one.
  const isConfigured = (aiConfig?.mode ?? 'app_bedrock') === 'app_bedrock' || aiConfig?.has_key === true

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
      return weeklyRecapService.explain(text, aiConfig, sessionSignal)
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
  }
}
