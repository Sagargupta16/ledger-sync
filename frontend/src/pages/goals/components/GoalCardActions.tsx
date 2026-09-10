import { useEffect, useRef, useState } from 'react'

import { AnimatePresence } from 'motion/react'
import { Pencil, Trash2, Edit3 } from 'lucide-react'

import { Button } from '@/components/ui'
import type { FinancialGoal } from '@/hooks/api/useAnalyticsV2'

import type { GoalDetails } from '../types'
import DeleteGoalDialog from './DeleteGoalDialog'
import EditGoalForm from './EditGoalForm'
import UpdateProgressForm from './UpdateProgressForm'

export interface GoalCardActionsProps {
  goal: FinancialGoal
  effectiveAmount: number
  isEditing: boolean
  isEditingDetails: boolean
  isBusy?: boolean
  isSaving?: boolean
  isDeleting?: boolean
  isDemoMode?: boolean
  updateError?: string | null
  deleteError?: string | null
  onStartEdit: () => void
  onStartEditDetails: () => void
  onSaveAllocation: (goalId: number, amount: number) => void
  onSaveDetails: (goalId: number, updates: GoalDetails) => void
  onCancelEdit: () => void
  onDelete: (goalId: number) => Promise<boolean>
}

export default function GoalCardActions({
  goal, effectiveAmount, isEditing, isEditingDetails,
  isBusy = false, isSaving = false, isDeleting = false, isDemoMode = false,
  updateError, deleteError, onStartEdit, onStartEditDetails,
  onSaveAllocation, onSaveDetails, onCancelEdit, onDelete,
}: Readonly<GoalCardActionsProps>) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const progressRef = useRef<HTMLButtonElement>(null)
  const detailsRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef({ progress: isEditing, details: isEditingDetails })

  useEffect(() => {
    if (!isEditing && !isEditingDetails) {
      if (wasEditing.current.progress) progressRef.current?.focus()
      if (wasEditing.current.details) detailsRef.current?.focus()
    }
    wasEditing.current = { progress: isEditing, details: isEditingDetails }
  }, [isEditing, isEditingDetails])

  return (
    <>
      <div className="mt-4 flex items-center justify-between gap-2">
        <Button
          ref={progressRef}
          onClick={onStartEdit}
          variant="secondary"
          size="sm"
          disabled={isBusy}
          aria-expanded={isEditing}
          aria-label={`Update progress: ${goal.name}`}
          icon={<Pencil className="h-3.5 w-3.5" />}
        >
          Update Progress
        </Button>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            ref={detailsRef}
            onClick={onStartEditDetails}
            title="Edit goal"
            aria-label={`Edit goal: ${goal.name}`}
            aria-expanded={isEditingDetails}
            variant="ghost"
            size="sm"
            disabled={isBusy}
            icon={<Edit3 className="h-3.5 w-3.5" />}
          />
          <Button
            onClick={() => setConfirmDelete(true)}
            title="Delete goal"
            aria-label={`Delete goal: ${goal.name}`}
            variant="ghost"
            size="sm"
            disabled={isBusy}
            icon={<Trash2 className="h-3.5 w-3.5" />}
            className="text-text-tertiary hover:bg-app-red/10 hover:text-app-red"
          />
        </div>
      </div>
      <AnimatePresence>
        {isEditing && (
          <UpdateProgressForm
            goalId={goal.id}
            currentAmount={effectiveAmount}
            targetAmount={goal.target_amount}
            isPending={isSaving}
            error={updateError}
            onSave={onSaveAllocation}
            onCancel={onCancelEdit}
          />
        )}
        {isEditingDetails && (
          <EditGoalForm
            goal={goal}
            isPending={isSaving}
            error={updateError}
            onSave={onSaveDetails}
            onCancel={onCancelEdit}
          />
        )}
      </AnimatePresence>
      <DeleteGoalDialog
        open={confirmDelete}
        goalName={goal.name}
        isPending={isDeleting}
        isDemoMode={isDemoMode}
        error={deleteError}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => onDelete(goal.id)}
      />
    </>
  )
}
