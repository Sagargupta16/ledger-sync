import { motion } from 'motion/react'

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
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <form onSubmit={onSubmit} className="glass rounded-2xl border border-border p-6 space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Create New Goal</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            autoFocus
            type="text"
            placeholder="Goal name *"
            aria-label="Goal name"
            value={formData.name}
            onChange={(e) => onFormDataChange({ ...formData, name: e.target.value })}
            className="px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-app-purple/50"
          />
          <select
            value={formData.goal_type}
            aria-label="Goal type"
            onChange={(e) => onFormDataChange({ ...formData, goal_type: e.target.value })}
            className="px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-app-purple/50"
          >
            {/* Options come from the shared vocabulary. Hardcoding them here was
                a third copy of the same six labels, and the surface most likely to
                drift: this is where a new goal_type value enters the database. */}
            {GOAL_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            placeholder="Target amount *"
            aria-label="Target amount"
            value={formData.target_amount}
            onChange={(e) => onFormDataChange({ ...formData, target_amount: e.target.value })}
            className="px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-app-purple/50"
          />
          <input
            type="date"
            aria-label="Target date"
            value={formData.target_date}
            onChange={(e) => onFormDataChange({ ...formData, target_date: e.target.value })}
            className="px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-app-purple/50"
          />
        </div>
        <input
          type="text"
          placeholder="Notes (optional)"
          aria-label="Notes"
          value={formData.notes}
          onChange={(e) => onFormDataChange({ ...formData, notes: e.target.value })}
          className="w-full px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-app-purple/50"
        />
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="min-h-9 rounded-md border border-foreground bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
          >
            {isPending ? 'Creating...' : 'Create Goal'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2 rounded-xl text-sm text-muted-foreground bg-[var(--overlay-2)] border border-border hover:bg-[var(--overlay-5)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </motion.div>
  )
}
