import { useState } from 'react'

import { AnimatePresence, motion } from 'motion/react'
import { Save, X } from 'lucide-react'

import { Button, Input, Select } from '@/components/ui'
import { DISCLOSURE_TRANSITION } from '@/constants/animations'
import type { FinancialGoal } from '@/hooks/api/useAnalyticsV2'

import { GOAL_TYPE_OPTIONS, goalTypeLabel } from '../constants'
import type { GoalDetails } from '../types'

export default function EditGoalForm({
  goal,
  isPending = false,
  error,
  onSave,
  onCancel,
}: Readonly<{
  goal: FinancialGoal
  isPending?: boolean
  error?: string | null
  onSave: (goalId: number, updates: GoalDetails) => void
  onCancel: () => void
}>) {
  const [name, setName] = useState(goal.name)
  const [goalType, setGoalType] = useState(goal.goal_type)
  const [targetAmount, setTargetAmount] = useState(String(goal.target_amount))
  const [targetDate, setTargetDate] = useState(goal.target_date?.slice(0, 10) ?? '')
  const [notes, setNotes] = useState(goal.notes ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)
  const typeOptions = GOAL_TYPE_OPTIONS.some((option) => option.value === goal.goal_type)
    ? [...GOAL_TYPE_OPTIONS]
    : [{ value: goal.goal_type, label: goalTypeLabel(goal.goal_type) }, ...GOAL_TYPE_OPTIONS]

  const handleSave = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isPending) return
    if (!name.trim()) {
      setValidationError('Goal name is required.')
      return
    }
    const numAmount = Number(targetAmount)
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setValidationError('Enter a positive target amount.')
      return
    }
    setValidationError(null)
    onSave(goal.id, {
      name: name.trim(),
      goal_type: goalType,
      target_amount: numAmount,
      target_date: targetDate || null,
      notes: notes.trim() || null,
    })
  }

  return (
    <AnimatePresence mode="popLayout" propagate>
      <motion.div
        {...DISCLOSURE_TRANSITION}
        className="overflow-hidden"
      >
        <form
          onSubmit={handleSave}
          aria-label={`Edit ${goal.name}`}
          aria-busy={isPending}
          className="mt-4 border-t border-border/50 pt-4"
        >
          <fieldset disabled={isPending} className="space-y-3">
            <Input
              id={`edit-name-${goal.id}`}
              label="Goal name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              required
              autoFocus
            />
            <Select
              id={`edit-type-${goal.id}`}
              label="Goal type"
              value={goalType}
              onChange={(e) => setGoalType(e.target.value)}
              options={typeOptions}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                id={`edit-amount-${goal.id}`}
                label="Target amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                max="9999999999999.99"
                step="0.01"
                required
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
              />
              <Input
                id={`edit-date-${goal.id}`}
                label="Target date (optional)"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
            <Input
              id={`edit-notes-${goal.id}`}
              label="Notes (optional)"
              value={notes}
              maxLength={10000}
              onChange={(e) => setNotes(e.target.value)}
            />
            {(validationError || error) && (
              <p role="alert" className="text-sm text-app-red">{validationError || error}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                size="sm"
                isLoading={isPending}
                icon={<Save className="h-3.5 w-3.5" />}
              >
                {isPending ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                type="button"
                onClick={onCancel}
                variant="secondary"
                size="sm"
                icon={<X className="h-3.5 w-3.5" />}
              >
                Cancel
              </Button>
            </div>
          </fieldset>
        </form>
      </motion.div>
    </AnimatePresence>
  )
}
