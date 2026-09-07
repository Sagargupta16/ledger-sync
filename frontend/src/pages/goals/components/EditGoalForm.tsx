import { useState } from 'react'

import { AnimatePresence, motion } from 'motion/react'
import { Save, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button, Input } from '@/components/ui'
import { DISCLOSURE_TRANSITION } from '@/constants/animations'
import type { FinancialGoal } from '@/hooks/api/useAnalyticsV2'

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
  const [targetDate, setTargetDate] = useState(goal.target_date?.slice(0, 10) ?? '')

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
    <AnimatePresence mode="popLayout" propagate>
      <motion.div
        {...DISCLOSURE_TRANSITION}
        className="overflow-hidden"
      >
        <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
          <Input
            id={`edit-name-${goal.id}`}
            label="Goal name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              id={`edit-amount-${goal.id}`}
              label="Target amount"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
            />
            <Input
              id={`edit-date-${goal.id}`}
              label="Target date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleSave}
              size="sm"
              icon={<Save className="h-3.5 w-3.5" />}
            >
              Save Changes
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
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
