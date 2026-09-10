import { useState, type Dispatch, type SetStateAction, type SubmitEvent } from 'react'

import { toast } from 'sonner'

import { useCreateGoal, useDeleteGoal, useUpdateGoal } from '@/hooks/api/useAnalyticsV2'
import { getApiErrorMessage } from '@/lib/errorUtils'
import type { FinancialGoal, UpdateGoalRequest } from '@/services/api/analyticsV2'

import type { GoalDetails } from './types'

const INITIAL_FORM_DATA = {
  name: '',
  goal_type: 'savings',
  target_amount: '',
  target_date: '',
  notes: '',
}

export default function useGoalActions(
  isDemoMode: boolean,
  setDemoGoals: Dispatch<SetStateAction<FinancialGoal[]>>,
) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState(INITIAL_FORM_DATA)
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null)
  const [editingDetailsGoalId, setEditingDetailsGoalId] = useState<number | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const createGoal = useCreateGoal()
  const updateGoal = useUpdateGoal()
  const deleteGoal = useDeleteGoal()
  const isGoalMutationPending = updateGoal.isPending || deleteGoal.isPending

  const handleCancelEdit = () => {
    if (isGoalMutationPending) return
    setEditingGoalId(null)
    setEditingDetailsGoalId(null)
    updateGoal.reset()
  }

  const startEdit = (goalId: number, details: boolean) => {
    if (isGoalMutationPending) return
    updateGoal.reset()
    setEditingGoalId(details ? null : goalId)
    setEditingDetailsGoalId(details ? goalId : null)
  }

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (createGoal.isPending) return
    const targetAmount = Number(formData.target_amount)
    if (!formData.name.trim() || !Number.isFinite(targetAmount) || targetAmount <= 0) {
      setValidationError('Enter a goal name and a positive target amount.')
      return
    }
    setValidationError(null)
    const data = {
      name: formData.name.trim(),
      goal_type: formData.goal_type,
      target_amount: targetAmount,
      target_date: formData.target_date || null,
      notes: formData.notes.trim() || null,
    }
    const onSuccess = () => {
      toast.success(isDemoMode ? 'Demo goal created for this visit' : 'Goal created')
      setShowCreateForm(false)
      setFormData(INITIAL_FORM_DATA)
    }
    if (isDemoMode) {
      const now = new Date().toISOString()
      setDemoGoals((goals) => [{
        ...data,
        id: Math.min(0, ...goals.map((goal) => goal.id)) - 1,
        current_amount: 0,
        progress_pct: 0,
        start_date: now,
        is_achieved: false,
        achieved_date: null,
        created_at: now,
        updated_at: now,
      }, ...goals])
      onSuccess()
      return
    }
    createGoal.mutate(data, { onSuccess })
  }

  const saveGoal = (goalId: number, data: UpdateGoalRequest, successMessage: string) => {
    if (isGoalMutationPending) return
    const onSuccess = () => {
      setEditingGoalId(null)
      setEditingDetailsGoalId(null)
      toast.success(isDemoMode ? 'Demo changes saved for this visit' : successMessage)
    }
    if (isDemoMode) {
      const now = new Date().toISOString()
      setDemoGoals((goals) => goals.map((goal) => {
        if (goal.id !== goalId) return goal
        const updated = { ...goal, ...data, updated_at: now }
        const achieved = updated.current_amount >= updated.target_amount
        return {
          ...updated,
          progress_pct: updated.current_amount / updated.target_amount * 100,
          is_achieved: achieved,
          achieved_date: achieved ? goal.achieved_date ?? now : null,
        }
      }))
      onSuccess()
      return
    }
    updateGoal.mutate({ goalId, data }, { onSuccess })
  }

  const handleDeleteGoal = async (goalId: number): Promise<boolean> => {
    if (isGoalMutationPending) return false
    if (isDemoMode) {
      setDemoGoals((goals) => goals.filter((goal) => goal.id !== goalId))
      toast.success('Demo goal removed for this visit')
      return true
    }
    try {
      await deleteGoal.mutateAsync(goalId)
      toast.success('Goal deleted')
      return true
    } catch {
      // Keep the confirmation open; the mutation error is displayed beside retry.
      return false
    }
  }

  return {
    showCreateForm,
    setShowCreateForm,
    formData,
    setFormData,
    createGoalPending: createGoal.isPending,
    createError: validationError ?? (createGoal.error ? getApiErrorMessage(createGoal.error) : null),
    editingGoalId,
    editingDetailsGoalId,
    startEdit,
    isGoalMutationPending,
    savingGoalId: updateGoal.isPending ? updateGoal.variables.goalId : null,
    deletingGoalId: deleteGoal.isPending ? deleteGoal.variables : null,
    updateError: updateGoal.error ? getApiErrorMessage(updateGoal.error) : null,
    deleteError: deleteGoal.error ? getApiErrorMessage(deleteGoal.error) : null,
    deleteErrorGoalId: deleteGoal.variables,
    handleSubmit,
    handleSaveAllocation: (goalId: number, amount: number) =>
      saveGoal(goalId, { current_amount: amount }, 'Progress saved'),
    handleSaveDetails: (goalId: number, data: GoalDetails) =>
      saveGoal(goalId, data, 'Goal updated'),
    handleCancelEdit,
    handleDeleteGoal,
  }
}
