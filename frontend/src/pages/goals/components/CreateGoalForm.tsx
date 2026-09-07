import { AnimatePresence, motion } from 'motion/react'

import { Button, Input, Select } from '@/components/ui'
import { DISCLOSURE_TRANSITION } from '@/constants/animations'

import { GOAL_TYPE_OPTIONS } from '../constants'

interface CreateGoalFormProps {
  formData: {
    name: string
    goal_type: string
    target_amount: string
    target_date: string
    notes: string
  }
  isPending: boolean
  onFormDataChange: (data: CreateGoalFormProps['formData']) => void
  onSubmit: (e: React.SubmitEvent<HTMLFormElement>) => void
  onCancel: () => void
}

export default function CreateGoalForm({
  formData,
  isPending,
  onFormDataChange,
  onSubmit,
  onCancel,
}: Readonly<CreateGoalFormProps>) {
  return (
    <AnimatePresence mode="popLayout" propagate>
      <motion.div
        {...DISCLOSURE_TRANSITION}
        className="overflow-hidden"
      >
        <form onSubmit={onSubmit} className="ledger-panel space-y-4 p-4 sm:p-5">
          <h3 className="text-lg font-semibold text-foreground">Create New Goal</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              autoFocus
              id="create-goal-name"
              label="Goal name"
              type="text"
              placeholder="e.g. Emergency fund"
              required
              value={formData.name}
              onChange={(e) => onFormDataChange({ ...formData, name: e.target.value })}
            />
            <Select
              id="create-goal-type"
              label="Goal type"
              value={formData.goal_type}
              onChange={(e) => onFormDataChange({ ...formData, goal_type: e.target.value })}
              options={[...GOAL_TYPE_OPTIONS]}
            />
            <Input
              id="create-goal-amount"
              label="Target amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="any"
              placeholder="0"
              required
              value={formData.target_amount}
              onChange={(e) => onFormDataChange({ ...formData, target_amount: e.target.value })}
            />
            <Input
              id="create-goal-date"
              label="Target date"
              type="date"
              required
              value={formData.target_date}
              onChange={(e) => onFormDataChange({ ...formData, target_date: e.target.value })}
            />
          </div>
          <Input
            id="create-goal-notes"
            label="Notes (optional)"
            type="text"
            placeholder="What this goal is for"
            value={formData.notes}
            onChange={(e) => onFormDataChange({ ...formData, notes: e.target.value })}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              isLoading={isPending}
            >
              {isPending ? 'Creating...' : 'Create Goal'}
            </Button>
            <Button
              type="button"
              onClick={onCancel}
              variant="secondary"
            >
              Cancel
            </Button>
          </div>
        </form>
      </motion.div>
    </AnimatePresence>
  )
}
