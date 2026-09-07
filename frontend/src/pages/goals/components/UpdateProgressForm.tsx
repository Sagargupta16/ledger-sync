import { useState } from 'react'

import { AnimatePresence, motion } from 'motion/react'
import { Save, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button, Input } from '@/components/ui'
import { DISCLOSURE_TRANSITION } from '@/constants/animations'
import { formatCurrencyCompact } from '@/lib/formatters'

export default function UpdateProgressForm({
  goalId,
  currentAmount,
  targetAmount,
  onSave,
  onCancel,
}: Readonly<{
  goalId: number
  currentAmount: number
  targetAmount: number
  onSave: (goalId: number, amount: number) => void
  onCancel: () => void
}>) {
  const [value, setValue] = useState(String(currentAmount))

  const handleSave = () => {
    const numValue = Number(value)
    if (Number.isNaN(numValue) || numValue < 0) {
      toast.error('Please enter a valid positive amount')
      return
    }
    if (numValue > targetAmount) {
      toast.error(`Amount cannot exceed target (${formatCurrencyCompact(targetAmount)})`)
      return
    }
    onSave(goalId, numValue)
  }

  return (
    <AnimatePresence mode="popLayout" propagate>
      <motion.div
        {...DISCLOSURE_TRANSITION}
        className="overflow-hidden"
      >
        <div className="mt-4 flex flex-col gap-3 border-t border-border/50 pt-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              id={`allocation-${goalId}`}
              label="Allocated amount"
              type="number"
              inputMode="decimal"
              min={0}
              max={targetAmount}
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleSave}
              size="sm"
              icon={<Save className="h-3.5 w-3.5" />}
            >
              Save
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
