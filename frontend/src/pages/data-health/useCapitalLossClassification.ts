/**
 * The capital-loss classification workflow on the Data Health page.
 *
 * The backend has always offered it -- data-health returns
 * `capital_loss_candidates` and `PUT /api/preferences/capital-loss-categories`
 * saves the keys -- but nothing in the app exposed either, so every realised
 * trading loss stayed in every spending total with no way out. A classified key
 * leaves spending everywhere (server rollups and client aggregates read the
 * same set, see `lib/expenseClassification.ts`) while still reducing savings.
 *
 * Saving the keys is not enough on its own: the server rebuilds its rollups
 * only on an explicit refresh, so the totals would keep the loss until the next
 * import. Each change therefore saves, then refreshes, then invalidates every
 * preference dependent. The two steps fail separately and say which one did.
 */

import { useState } from 'react'

import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  invalidatePreferenceDependents,
  usePreferences,
  useUpdateCapitalLossCategories,
} from '@/hooks/api/usePreferences'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import { capitalLossKeySet, classificationKey, KEY_SEPARATOR } from '@/lib/expenseClassification'
import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'
import type { CapitalLossCandidate } from '@/services/api/analyticsV2DataHealth'
import { uploadService } from '@/services/api/upload'

/** `pendingKey` while only the rebuild is re-running; matches no real key. */
const REFRESH_ONLY = '\u0000refresh'

/** Which half of a classification change failed, for honest copy. */
export type ClassificationFailure = 'save' | 'refresh'

/** One saved key, split for display. */
export interface ClassifiedLossKey {
  /** The stored string, sent back verbatim when it is removed. */
  readonly key: string
  readonly category: string
  readonly subcategory: string
}

function splitKey(key: string): ClassifiedLossKey {
  const at = key.indexOf(KEY_SEPARATOR)
  return {
    key,
    category: at === -1 ? key : key.slice(0, at),
    subcategory: at === -1 ? '' : key.slice(at + KEY_SEPARATOR.length),
  }
}

/** Normalised form of a stored key, so removal matches the backend's comparison. */
function normalisedKey(key: string): string {
  const { category, subcategory } = splitKey(key)
  return classificationKey(category, subcategory)
}

/**
 * Rebuild the rollups after the classified set changed, then mark every
 * preference dependent stale -- `/calculations/*` read the same rollups the
 * v2 pages do. Session-safe like the other mutations: the captured session is
 * asserted before dispatch and re-checked before any cache is touched.
 */
function useRefreshAfterClassification() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()
  return useMutation({
    mutationKey: ['preferences', 'capital-loss-refresh', getSessionGeneration()],
    mutationFn: () => {
      assertCurrentSession(sessionSignal)
      return uploadService.refreshAnalytics()
    },
    onMutate: () => sessionSignal,
    onSuccess: async (_data, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      await invalidatePreferenceDependents(queryClient, false, false)
    },
  })
}

export function useCapitalLossClassification(candidates: readonly CapitalLossCandidate[]) {
  const preferencesQuery = usePreferences()
  const save = useUpdateCapitalLossCategories()
  const refresh = useRefreshAfterClassification()
  const { guardDemoAction } = useDemoGuard()
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [failure, setFailure] = useState<ClassificationFailure | null>(null)

  // Every save REPLACES the whole set, so acting before the current set loads
  // (or after its read failed) would silently drop the keys already saved.
  const canEdit = preferencesQuery.data !== undefined
  const saved = preferencesQuery.data?.capital_loss_categories ?? []
  const classified = saved.map(splitKey)
  // The server already filters classified taxonomies out of the candidates;
  // filtering again here keeps a just-saved key from flashing back while the
  // data-health refetch is in flight.
  const savedKeys = capitalLossKeySet(saved)
  const openCandidates = candidates.filter(
    (candidate) => !savedKeys.has(classificationKey(candidate.category, candidate.subcategory)),
  )

  const runRefresh = async () => {
    try {
      await refresh.mutateAsync()
    } catch {
      setFailure('refresh')
    }
  }

  const apply = async (next: string[], key: string) => {
    if (!canEdit || guardDemoAction('Classifying realised losses')) return
    setPendingKey(key)
    setFailure(null)
    try {
      await save.mutateAsync({ capital_loss_categories: next })
      await runRefresh()
    } catch {
      setFailure('save')
    }
    setPendingKey(null)
  }

  return {
    candidates: openCandidates,
    classified,
    /** False until the saved set is known; the actions stay disabled until then. */
    canEdit,
    isBusy: pendingKey !== null,
    pendingKey,
    failure,
    classify: (candidate: CapitalLossCandidate) => {
      if (savedKeys.has(classificationKey(candidate.category, candidate.subcategory))) return
      void apply([...saved, candidate.key], candidate.key)
    },
    unclassify: (key: string) => {
      const target = normalisedKey(key)
      void apply(
        saved.filter((entry) => normalisedKey(entry) !== target),
        key,
      )
    },
    /** The keys saved but the rebuild failed: retry only the rebuild. */
    retryRefresh: () => {
      setPendingKey(REFRESH_ONLY)
      setFailure(null)
      void runRefresh().finally(() => setPendingKey(null))
    },
  }
}
