import { useState, useMemo } from 'react'

import { useGoals, useMonthlySummaries } from '@/hooks/api/useAnalyticsV2'
import { useTotals } from '@/hooks/api/useAnalytics'
import { parseLocalDate } from '@/lib/dateUtils'
import { generateDemoGoals } from '@/lib/demo/generateDerivedData'
import { useDemoStore } from '@/store/demoStore'

import { computeGoalProjection } from './helpers'
import type { GoalProjection } from './types'
import useGoalActions from './useGoalActions'
import useLegacyGoalRecovery from './useLegacyGoalRecovery'

export default function useGoalsState() {
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  // This page is keyed by identity. Demo edits are discarded on exit or account change.
  const [demoGoals, setDemoGoals] = useState(() => isDemoMode ? generateDemoGoals() : [])
  const actions = useGoalActions(isDemoMode, setDemoGoals)
  const goalsQuery = useGoals({ include_achieved: true })
  const recovery = useLegacyGoalRecovery(goalsQuery)
  const goals = useMemo(
    () => isDemoMode ? demoGoals : goalsQuery.data ?? [],
    [isDemoMode, demoGoals, goalsQuery.data],
  )
  const totalsQuery = useTotals()
  const monthlySummariesQuery = useMonthlySummaries()
  const totals = totalsQuery.data
  const monthlySummaries = useMemo(
    () => monthlySummariesQuery.data ?? [],
    [monthlySummariesQuery.data],
  )
  const isLoading =
    (!isDemoMode && goalsQuery.isLoading) ||
    totalsQuery.isLoading ||
    monthlySummariesQuery.isLoading
  const isError =
    (!isDemoMode && goalsQuery.isError) ||
    totalsQuery.isError ||
    monthlySummariesQuery.isError
  const retry = () => {
    void goalsQuery.refetch()
    void totalsQuery.refetch()
    void monthlySummariesQuery.refetch()
  }

  const effectiveAmounts = useMemo(() => {
    const map: Record<number, number> = {}
    for (const goal of goals) {
      map[goal.id] = goal.current_amount
    }
    return map
  }, [goals])

  const netSavings = totals?.net_savings ?? 0

  const avgMonthlySavings = useMemo(() => {
    if (monthlySummaries.length === 0) return null
    const totalSavings = monthlySummaries.reduce((sum, m) => sum + m.savings.net, 0)
    return totalSavings / monthlySummaries.length
  }, [monthlySummaries])

  const totalAllocated = useMemo(() => {
    return goals.reduce((sum, g) => sum + (effectiveAmounts[g.id] ?? 0), 0)
  }, [goals, effectiveAmounts])

  const summary = useMemo(() => {
    const achieved = goals.filter(
      (g) => g.is_achieved || (effectiveAmounts[g.id] ?? 0) >= g.target_amount,
    ).length
    return { total: goals.length, achieved, inProgress: goals.length - achieved }
  }, [goals, effectiveAmounts])

  const projections = useMemo(() => {
    const now = new Date()
    const map: Record<number, GoalProjection> = {}
    for (const goal of goals) {
      map[goal.id] = computeGoalProjection(goal, effectiveAmounts[goal.id] ?? 0, avgMonthlySavings, now)
    }
    return map
  }, [goals, effectiveAmounts, avgMonthlySavings])

  const sortedGoals = useMemo(() => {
    return [...goals].sort((a, b) => {
      const aAchieved = a.is_achieved || (effectiveAmounts[a.id] ?? 0) >= a.target_amount
      const bAchieved = b.is_achieved || (effectiveAmounts[b.id] ?? 0) >= b.target_amount
      if (aAchieved && !bAchieved) return 1
      if (!aAchieved && bAchieved) return -1
      // Dateless goals (null target_date) sort last instead of becoming NaN.
      const aTime = a.target_date ? parseLocalDate(a.target_date).getTime() : Infinity
      const bTime = b.target_date ? parseLocalDate(b.target_date).getTime() : Infinity
      return aTime - bTime
    })
  }, [goals, effectiveAmounts])

  return {
    ...actions,
    recovery,
    isDemoMode,
    goals,
    sortedGoals,
    effectiveAmounts,
    projections,
    summary,
    netSavings,
    totalAllocated,
    avgMonthlySavings,
    totals,
    totalsLoading: totalsQuery.isLoading,
    isLoading,
    isError,
    retry,
  }
}
