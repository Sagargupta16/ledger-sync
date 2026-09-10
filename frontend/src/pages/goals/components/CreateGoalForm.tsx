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
  error?: string | null
  onFormDataChange: (data: CreateGoalFormProps['formData']) => void
  onSubmit: (e: React.SubmitEvent<HTMLFormElement>) => void
  onCancel: () => void
}

export default function CreateGoalForm({
  formData,
  isPending,
  error,
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
        <form onSubmit={onSubmit} aria-busy={isPending} className="ledger-panel space-y-4 p-4 sm:p-5">
          <h3 className="text-lg font-semibold text-foreground">Create New Goal</h3>
          <fieldset disabled={isPending} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                autoFocus
                id="create-goal-name"
                label="Goal name"
                type="text"
                placeholder="e.g. Emergency fund"
                required
                maxLength={255}
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
                max="9999999999999.99"
                step="0.01"
                placeholder="0"
                required
                value={formData.target_amount}
                onChange={(e) => onFormDataChange({ ...formData, target_amount: e.target.value })}
              />
              <Input
                id="create-goal-date"
                label="Target date (optional)"
                type="date"
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
              maxLength={10000}
              onChange={(e) => onFormDataChange({ ...formData, notes: e.target.value })}
            />
            {error && <p role="alert" className="text-sm text-app-red">{error}</p>}
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
          </fieldset>
        </form>
      </motion.div>
    </AnimatePresence>
  )
}
