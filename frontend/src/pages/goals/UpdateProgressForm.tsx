import { useState } from 'react'
import { motion } from 'framer-motion'
import { Save, X } from 'lucide-react'
import { formatCurrencyCompact } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { toast } from 'sonner'

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
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mt-4 pt-4 border-t border-border/50 flex items-center gap-3">
        <div className="flex-1">
          <label htmlFor={`allocation-${goalId}`} className="text-xs text-text-tertiary mb-1 block">Allocated Amount</label>
          <input
            id={`allocation-${goalId}`}
            type="number"
            min={0}
            max={targetAmount}
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-3 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
            autoFocus
          />
        </div>
        <div className="flex gap-2 pt-4">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white transition-colors hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${rawColors.ios.green}, ${rawColors.ios.teal})` }}
          >
            <Save className="w-3.5 h-3.5" /> Save
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
