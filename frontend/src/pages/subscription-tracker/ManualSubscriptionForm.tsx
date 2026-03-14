import { useState } from 'react'
import { motion } from 'framer-motion'
import { Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { rawColors } from '@/constants/colors'
import type { ManualSubscription } from './types'

interface ManualSubscriptionFormProps {
  initial?: ManualSubscription
  onSave: (data: Omit<ManualSubscription, 'id'>) => void
  onCancel: () => void
  isEdit?: boolean
}

export function ManualSubscriptionForm({
  initial,
  onSave,
  onCancel,
  isEdit,
}: Readonly<ManualSubscriptionFormProps>) {
  const [name, setName] = useState(initial?.name ?? '')
  const [amount, setAmount] = useState(initial?.amount == null ? '' : String(initial.amount))
  const [frequency, setFrequency] = useState(initial?.frequency ?? 'monthly')
  const [nextDue, setNextDue] = useState(initial?.next_due ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Subscription name is required')
      return
    }
    const numAmount = Number(amount)
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid positive amount')
      return
    }
    onSave({
      name: name.trim(),
      amount: numAmount,
      frequency,
      next_due: nextDue,
      category: category.trim() || undefined,
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="glass rounded-2xl border border-border p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">
          {isEdit ? 'Edit Subscription' : 'Add Manual Subscription'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="manual-sub-name" className="text-xs text-text-tertiary mb-1 block">Name *</label>
            <input
              id="manual-sub-name"
              type="text"
              placeholder="e.g. Netflix, Spotify"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="manual-sub-amount" className="text-xs text-text-tertiary mb-1 block">Amount *</label>
            <input
              id="manual-sub-amount"
              type="number"
              placeholder="Amount per cycle"
              min={0}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
            />
          </div>
          <div>
            <label htmlFor="manual-sub-frequency" className="text-xs text-text-tertiary mb-1 block">Frequency</label>
            <select
              id="manual-sub-frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div>
            <label htmlFor="manual-sub-due" className="text-xs text-text-tertiary mb-1 block">Next Due Date</label>
            <input
              id="manual-sub-due"
              type="date"
              value={nextDue}
              onChange={(e) => setNextDue(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
            />
          </div>
        </div>
        <div>
          <label htmlFor="manual-sub-category" className="text-xs text-text-tertiary mb-1 block">Category (optional)</label>
          <input
            id="manual-sub-category"
            type="text"
            placeholder="e.g. Entertainment, Bills & Utilities"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${rawColors.ios.green}, ${rawColors.ios.teal})` }}
          >
            <Save className="w-4 h-4" />
            {isEdit ? 'Save Changes' : 'Add Subscription'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm text-muted-foreground bg-white/5 border border-border hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
        </div>
      </div>
    </motion.div>
  )
}
