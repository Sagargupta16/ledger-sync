import { useEffect, useRef, useState } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'

import { useDeleteGoal, useUpdateGoal } from '@/hooks/api/useAnalyticsV2'
import { getApiErrorMessage } from '@/lib/errorUtils'
import { assertCurrentSession, getSessionSignal, isCurrentSession } from '@/lib/session'
import type { FinancialGoal } from '@/services/api/analyticsV2'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'

import {
  acknowledgeGoalRecovery,
  getLegacyGoalRecovery,
  goalRecoveryVersion,
  readLegacyGoalData,
  recoveryPatch,
  type LegacyGoalRecovery,
  type RecoveryChange,
} from './legacyGoalRecovery'

type RecoveryAction = 'save' | 'delete' | 'keep'

const SUCCESS_MESSAGES: Record<RecoveryAction, string> = {
  save: 'Selected goal changes saved.',
  delete: 'Goal deleted.',
  keep: 'Current goal kept.',
}

export default function useLegacyGoalRecovery(query: UseQueryResult<FinancialGoal[], Error>) {
  const userId = useAuthStore((state) => state.user?.id)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated
    && !!state.accessToken && state.accessToken !== 'demo-token')
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  const enabled = userId != null && isAuthenticated && !isDemoMode
  const [stored, setStored] = useState(() => enabled ? readLegacyGoalData() : null)
  const [pendingGoalId, setPendingGoalId] = useState<number | null>(null)
  const [error, setError] = useState<{ goalId: number; message: string } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const pendingRef = useRef(false)
  const updateGoal = useUpdateGoal()
  const deleteGoal = useDeleteGoal()

  useEffect(() => {
    if (!enabled) return
    const refresh = () => setStored(readLegacyGoalData())
    globalThis.addEventListener('storage', refresh)
    globalThis.addEventListener('focus', refresh)
    return () => {
      globalThis.removeEventListener('storage', refresh)
      globalThis.removeEventListener('focus', refresh)
    }
  }, [enabled])

  const items = enabled && stored && query.isSuccess
    ? getLegacyGoalRecovery(query.data, userId, stored)
    : []

  const run = async (
    recovery: LegacyGoalRecovery,
    action: RecoveryAction,
    changes: RecoveryChange[] = [],
  ): Promise<boolean> => {
    if (!enabled || pendingRef.current || (action === 'save' && !changes.length)) return false
    const signal = getSessionSignal()
    pendingRef.current = true
    setPendingGoalId(recovery.goal.id)
    setError(null)
    setMessage(null)
    try {
      const result = await query.refetch({ throwOnError: true })
      assertCurrentSession(signal)
      if (useAuthStore.getState().user?.id !== userId || useDemoStore.getState().isDemoMode) return false
      const goal = result.data?.find((item) => item.id === recovery.goal.id)
      if (!goal) throw new Error('This goal is no longer available for this account.')
      if (goalRecoveryVersion(goal) !== goalRecoveryVersion(recovery.goal)) {
        throw new Error('This goal changed. Review its current values before trying again.')
      }
      const latest = getLegacyGoalRecovery([goal], userId, readLegacyGoalData())[0]
      const reviewed = action === 'save' ? changes : recovery.changes
      if (!latest || reviewed.some((change) =>
        !latest.changes.some((item) => item.field === change.field && item.token === change.token))
        || (action !== 'save' && recovery.hidden && !latest.hidden)) {
        throw new Error('Browser data changed. Review the latest values before continuing.')
      }

      if (action === 'save') {
        await updateGoal.mutateAsync({ goalId: goal.id, data: recoveryPatch(changes) })
      } else if (action === 'delete') {
        await deleteGoal.mutateAsync(goal.id)
      }
      assertCurrentSession(signal)
      if (useAuthStore.getState().user?.id !== userId || useDemoStore.getState().isDemoMode) return false
      const recorded = acknowledgeGoalRecovery(userId, recovery, reviewed, action !== 'save')
      setMessage(recorded
        ? SUCCESS_MESSAGES[action]
        : 'Your choice succeeded, but this browser could not remember the review. Original browser data is still intact.')
      setStored(readLegacyGoalData())
      return true
    } catch (error_) {
      if (isCurrentSession(signal)) {
        setError({ goalId: recovery.goal.id, message: getApiErrorMessage(error_) })
        setStored(readLegacyGoalData())
      }
      return false
    } finally {
      pendingRef.current = false
      setPendingGoalId(null)
    }
  }

  return {
    items,
    pendingGoalId,
    error,
    message,
    refresh: () => setStored(enabled ? readLegacyGoalData() : null),
    save: (recovery: LegacyGoalRecovery, changes: RecoveryChange[]) => run(recovery, 'save', changes),
    remove: (recovery: LegacyGoalRecovery) => run(recovery, 'delete'),
    keep: (recovery: LegacyGoalRecovery) => run(recovery, 'keep'),
  }
}

export type GoalRecoveryState = ReturnType<typeof useLegacyGoalRecovery>
