import { useState, useMemo, useCallback } from 'react'

import { toast } from 'sonner'

import { useGoals, useCreateGoal, useMonthlySummaries } from '@/hooks/api/useAnalyticsV2'
import { useTotals } from '@/hooks/api/useAnalytics'
import { useDemoGuard } from '@/hooks/useDemoGuard'

import { computeGoalProjection, loadAllocations, saveAllocations, loadDeletedGoals, saveDeletedGoals, loadGoalOverrides, saveGoalOverrides } from './helpers'
import type { GoalOverride, GoalProjection } from './types'

const INITIAL_FORM_DATA = {
  name: '',
  goal_type: 'savings',
  target_amount: '',
  target_date: '',
  notes: '',
}

export default function useGoalsState() {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null)
  const [editingDetailsGoalId, setEditingDetailsGoalId] = useState<number | null>(null)
  const [allocations, setAllocations] = useState<Record<string, number>>(loadAllocations)
  const [deletedGoalIds, setDeletedGoalIds] = useState<Set<number>>(loadDeletedGoals)
  const [goalOverrides, setGoalOverrides] = useState<Record<number, GoalOverride>>(loadGoalOverrides)
  const [formData, setFormData] = useState(INITIAL_FORM_DATA)

  const { data: rawGoals = [], isLoading: goalsLoading } = useGoals({ include_achieved: true })

  const goals = useMemo(
    () =>
      rawGoals
        .filter((g) => !deletedGoalIds.has(g.id))
        .map((g) => {
          const override = goalOverrides[g.id]
          if (!override) return g
          return { ...g, name: override.name, target_amount: override.target_amount, target_date: override.target_date }
        }),
    [rawGoals, deletedGoalIds, goalOverrides],
  )

  const createGoal = useCreateGoal()
  const { guardDemoAction } = useDemoGuard()
  const { data: totals, isLoading: totalsLoading } = useTotals()
  const { data: monthlySummaries = [] } = useMonthlySummaries()

  const effectiveAmounts = useMemo(() => {
    const map: Record<number, number> = {}
    for (const goal of goals) {
      const localAmount = allocations[String(goal.id)] ?? 0
      map[goal.id] = Math.max(goal.current_amount, localAmount)
    }
    return map
  }, [goals, allocations])

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
      return new Date(a.target_date).getTime() - new Date(b.target_date).getTime()
    })
  }, [goals, effectiveAmounts])

  // Handlers
  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (guardDemoAction('Creating goals')) return
      if (!formData.name || !formData.target_amount || !formData.target_date) {
        toast.error('Please fill in required fields')
        return
      }
      createGoal.mutate(
        {
          name: formData.name,
          goal_type: formData.goal_type,
          target_amount: Number(formData.target_amount),
          target_date: formData.target_date,
          notes: formData.notes || undefined,
        },
        {
          onSuccess: () => {
            toast.success('Goal created successfully')
            setShowCreateForm(false)
            setFormData(INITIAL_FORM_DATA)
          },
        },
      )
    },
    [formData, createGoal, guardDemoAction],
  )

  const handleSaveAllocation = useCallback(
    (goalId: number, amount: number) => {
      const updated = { ...allocations, [String(goalId)]: amount }
      setAllocations(updated)
      saveAllocations(updated)
      setEditingGoalId(null)
      toast.success('Progress updated')
    },
    [allocations],
  )

  const handleCancelEdit = useCallback(() => {
    setEditingGoalId(null)
    setEditingDetailsGoalId(null)
  }, [])

  const handleDeleteGoal = useCallback(
    (goalId: number) => {
      const updated = new Set(deletedGoalIds)
      updated.add(goalId)
      setDeletedGoalIds(updated)
      saveDeletedGoals(updated)
      toast.success('Goal removed')
    },
    [deletedGoalIds],
  )

  const handleSaveDetails = useCallback(
    (goalId: number, updates: { name: string; target_amount: number; target_date: string }) => {
      const updated = { ...goalOverrides, [goalId]: updates }
      setGoalOverrides(updated)
      saveGoalOverrides(updated)
      setEditingDetailsGoalId(null)
      toast.success('Goal updated')
    },
    [goalOverrides],
  )

  return {
    // Data
    goals,
    sortedGoals,
    effectiveAmounts,
    projections,
    summary,
    netSavings,
    totalAllocated,
    avgMonthlySavings,
    totals,
    totalsLoading,
    isLoading: goalsLoading,
    // Form state
    showCreateForm,
    setShowCreateForm,
    formData,
    setFormData,
    createGoalPending: createGoal.isPending,
    // Edit state
    editingGoalId,
    setEditingGoalId,
    editingDetailsGoalId,
    setEditingDetailsGoalId,
    // Handlers
    handleSubmit,
    handleSaveAllocation,
    handleCancelEdit,
    handleDeleteGoal,
    handleSaveDetails,
  }
}
