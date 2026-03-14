import { useState } from 'react'
import { motion } from 'framer-motion'
import { Save, X } from 'lucide-react'
import type { FinancialGoal } from '@/hooks/api/useAnalyticsV2'
import { rawColors } from '@/constants/colors'
import { toast } from 'sonner'

export default function EditGoalForm({
  goal,
  onSave,
  onCancel,
}: Readonly<{
  goal: FinancialGoal
  onSave: (goalId: number, updates: { name: string; target_amount: number; target_date: string }) => void
  onCancel: () => void
}>) {
  const [name, setName] = useState(goal.name)
  const [targetAmount, setTargetAmount] = useState(String(goal.target_amount))
  const [targetDate, setTargetDate] = useState(goal.target_date.slice(0, 10))

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Goal name is required')
      return
    }
    const numAmount = Number(targetAmount)
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid positive target amount')
      return
    }
    if (!targetDate) {
      toast.error('Target date is required')
      return
    }
    onSave(goal.id, { name: name.trim(), target_amount: numAmount, target_date: targetDate })
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
        <div>
          <label htmlFor={`edit-name-${goal.id}`} className="text-xs text-text-tertiary mb-1 block">Goal Name</label>
          <input
            id={`edit-name-${goal.id}`}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`edit-amount-${goal.id}`} className="text-xs text-text-tertiary mb-1 block">Target Amount</label>
            <input
              id={`edit-amount-${goal.id}`}
              type="number"
              min={0}
              step="any"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              className="w-full px-3 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
            />
          </div>
          <div>
            <label htmlFor={`edit-date-${goal.id}`} className="text-xs text-text-tertiary mb-1 block">Target Date</label>
            <input
              id={`edit-date-${goal.id}`}
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full px-3 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white transition-colors hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.indigo})` }}
          >
            <Save className="w-3.5 h-3.5" /> Save Changes
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-muted-foreground bg-white/5 border border-border hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      </div>
    </motion.div>
  )
}
