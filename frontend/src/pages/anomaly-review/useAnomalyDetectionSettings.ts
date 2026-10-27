/**
 * Draft, save and re-run for the detection settings on /anomalies.
 *
 * Saving the preferences is not enough on its own: the server rebuilds the
 * anomaly list only on a refresh, so a switched-off type would stay on screen
 * until the next import. A save therefore saves, then re-runs detection, then
 * marks every preference dependent stale; the two steps fail separately and the
 * toast says which one did. Demo mode stops at the guard.
 */

import { useMemo, useState } from 'react'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  invalidatePreferenceDependents,
  usePreferences,
  useUpdateAnomalySettings,
} from '@/hooks/api/usePreferences'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import {
  assertCurrentSession,
  getSessionGeneration,
  getSessionSignal,
  isCurrentSession,
} from '@/lib/session'
import type { AnomalyTypeValue } from '@/services/api/analyticsV2Anomalies'
import { uploadService } from '@/services/api/upload'
import type { LocalPrefKey, LocalPrefs } from '@/pages/settings/types'

import { resolveEnabledTypes, serializeEnabledTypes } from './anomalySettings'

type DetectionKey =
  | 'anomaly_expense_threshold'
  | 'anomaly_types_enabled'
  | 'auto_dismiss_recurring_anomalies'

/** Re-run detection, then mark the preference dependents (anomalies included) stale. */
function useRerunDetection() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()
  return useMutation({
    mutationKey: ['preferences', 'anomaly-refresh', getSessionGeneration()],
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

export function useAnomalyDetectionSettings() {
  const preferencesQuery = usePreferences()
  const save = useUpdateAnomalySettings()
  const rerun = useRerunDetection()
  const { guardDemoAction } = useDemoGuard()
  const [edits, setEdits] = useState<Partial<Pick<LocalPrefs, DetectionKey>>>({})
  const hasChanges = Object.keys(edits).length > 0

  const localPrefs = useMemo<LocalPrefs | null>(
    () => (preferencesQuery.data ? { ...preferencesQuery.data, ...edits } : null),
    [preferencesQuery.data, edits],
  )
  const enabledTypes = useMemo(
    () => resolveEnabledTypes(localPrefs?.anomaly_types_enabled),
    [localPrefs?.anomaly_types_enabled],
  )

  const updateLocalPref = <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => {
    setEdits((current) => ({ ...current, [key]: value }))
  }

  const setTypeEnabled = (type: AnomalyTypeValue, on: boolean) => {
    const next = new Set(enabledTypes)
    if (on) next.add(type)
    else next.delete(type)
    updateLocalPref('anomaly_types_enabled', serializeEnabledTypes(next))
  }

  const handleSave = async () => {
    if (!localPrefs || guardDemoAction('Saving anomaly settings')) return
    try {
      await save.mutateAsync({
        anomaly_expense_threshold: localPrefs.anomaly_expense_threshold,
        anomaly_types_enabled: localPrefs.anomaly_types_enabled,
        auto_dismiss_recurring_anomalies: localPrefs.auto_dismiss_recurring_anomalies,
      })
    } catch {
      toast.error('Failed to save anomaly settings')
      return
    }
    setEdits({})
    try {
      await rerun.mutateAsync()
      toast.success('Anomaly settings saved and detection re-run')
    } catch {
      toast.error('Settings saved, but detection did not re-run. Retry it from Data Health.')
    }
  }

  return {
    preferencesQuery,
    localPrefs,
    enabledTypes,
    hasChanges,
    isSaving: save.isPending || rerun.isPending,
    updateLocalPref,
    setTypeEnabled,
    handleSave,
  }
}
