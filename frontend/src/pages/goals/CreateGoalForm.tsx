import { motion } from 'framer-motion'
import { rawColors } from '@/constants/colors'

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
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
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
        <h3 className="text-lg font-semibold text-white">Create New Goal</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="Goal name *"
            value={formData.name}
            onChange={(e) => onFormDataChange({ ...formData, name: e.target.value })}
            className="px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
          />
          <select
            value={formData.goal_type}
            onChange={(e) => onFormDataChange({ ...formData, goal_type: e.target.value })}
            className="px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
          >
            <option value="savings">Savings</option>
            <option value="debt_payoff">Debt Payoff</option>
            <option value="investment">Investment</option>
            <option value="expense_reduction">Expense Reduction</option>
            <option value="income_increase">Income Increase</option>
            <option value="custom">Custom</option>
          </select>
          <input
            type="number"
            placeholder="Target amount *"
            value={formData.target_amount}
            onChange={(e) => onFormDataChange({ ...formData, target_amount: e.target.value })}
            className="px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
          />
          <input
            type="date"
            value={formData.target_date}
            onChange={(e) => onFormDataChange({ ...formData, target_date: e.target.value })}
            className="px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
          />
        </div>
        <input
          type="text"
          placeholder="Notes (optional)"
          value={formData.notes}
          onChange={(e) => onFormDataChange({ ...formData, notes: e.target.value })}
          className="w-full px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
        />
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="px-5 py-2 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.indigo})` }}
          >
            {isPending ? 'Creating...' : 'Create Goal'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2 rounded-xl text-sm text-muted-foreground bg-white/5 border border-border hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </motion.div>
  )
}
