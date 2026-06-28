import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, X } from 'lucide-react'
import { toast } from 'sonner'

import { FREQUENCY_OPTIONS } from '../constants'
import type { Suggestion } from '../types'

export function AddRecurringForm({
  onSave,
  onCancel,
  initial,
}: Readonly<{
  onSave: (data: { name: string; type: string; frequency: string; amount: number; category?: string }) => void
  onCancel: () => void
  initial?: Suggestion
}>) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<string>(initial?.type ?? 'Expense')
  const [frequency, setFrequency] = useState(initial?.frequency ?? 'monthly')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(initial?.category ?? '')

  const handleSubmit = () => {
    if (!name.trim()) { toast.error('Name is required'); return }
    const amt = Number(amount)
    if (Number.isNaN(amt) || amt <= 0) { toast.error('Enter a valid amount'); return }
    onSave({ name: name.trim(), type, frequency, amount: amt, category: category.trim() || undefined })
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="glass rounded-2xl border border-app-blue/30 p-6 space-y-4">
        <p className="text-sm font-medium text-foreground">Add Recurring Transaction</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="add-name" className="text-xs text-text-tertiary block mb-1">Name</label>
            <input id="add-name" type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. House Rent" autoFocus
              className="w-full px-3 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-app-blue/50" />
          </div>
          <div>
            <label htmlFor="add-type" className="text-xs text-text-tertiary block mb-1">Type</label>
            <select id="add-type" value={type} onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-app-blue/50">
              <option value="Expense">Expense</option>
              <option value="Income">Income</option>
            </select>
          </div>
          <div>
            <label htmlFor="add-freq" className="text-xs text-text-tertiary block mb-1">Frequency</label>
            <select id="add-freq" value={frequency} onChange={(e) => setFrequency(e.target.value)}
              className="w-full px-3 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-app-blue/50">
              {FREQUENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="add-amt" className="text-xs text-text-tertiary block mb-1">Amount</label>
            <input id="add-amt" type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="Per cycle"
              className="w-full px-3 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-app-blue/50" />
          </div>
          <div>
            <label htmlFor="add-cat" className="text-xs text-text-tertiary block mb-1">Category (optional)</label>
            <input id="add-cat" type="text" value={category} onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Housing"
              className="w-full px-3 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-app-blue/50" />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleSubmit}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-app-blue/20 text-app-blue hover:bg-app-blue/30 transition-colors">
            <Check className="w-3.5 h-3.5" /> Add
          </button>
          <button type="button" onClick={onCancel}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-muted-foreground bg-[var(--overlay-2)] hover:bg-[var(--overlay-5)] transition-colors">
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      </div>
    </motion.div>
  )
}
