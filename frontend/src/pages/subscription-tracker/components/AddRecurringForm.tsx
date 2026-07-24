import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Check, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button, Input, Select } from '@/components/ui'

import { FREQUENCY_OPTIONS } from '../constants'
import type { RecurringFormData, Suggestion } from '../types'

export function AddRecurringForm({
  onSave,
  onCancel,
  initial,
  isSaving = false,
}: Readonly<{
  onSave: (data: RecurringFormData) => void
  onCancel: () => void
  initial?: Suggestion
  isSaving?: boolean
}>) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<RecurringFormData['type']>(initial?.type ?? 'Expense')
  const [frequency, setFrequency] = useState(initial?.frequency ?? 'monthly')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(initial?.category ?? '')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) { toast.error('Name is required'); return }
    const amt = Number(amount)
    if (Number.isNaN(amt) || amt <= 0) { toast.error('Enter a valid amount'); return }
    onSave({ name: name.trim(), type, frequency, amount: amt, category: category.trim() || undefined })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
    >
      <form
        onSubmit={handleSubmit}
        className="glass space-y-4 rounded-xl border border-app-blue/30 p-4 sm:p-6"
      >
        <h2 className="text-sm font-medium text-foreground">Add Recurring Transaction</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-1">
            <Input
              id="add-name"
              label="Name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. House Rent"
              autoFocus
            />
          </div>
          <Select
            id="add-type"
            label="Type"
            value={type}
            onChange={(event) => setType(event.target.value as RecurringFormData['type'])}
            options={[
              { value: 'Expense', label: 'Expense' },
              { value: 'Income', label: 'Income' },
            ]}
          />
          <Select
            id="add-freq"
            label="Frequency"
            value={frequency}
            onChange={(event) => setFrequency(event.target.value)}
            options={FREQUENCY_OPTIONS}
          />
          <Input
            id="add-amt"
            label="Amount"
            type="number"
            min={0}
            step="any"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Per cycle"
          />
          <Input
            id="add-cat"
            label="Category (optional)"
            type="text"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="e.g. Housing"
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="submit"
            variant="primary"
            icon={<Check className="h-4 w-4" />}
            isLoading={isSaving}
          >
            Add
          </Button>
          <Button
            type="button"
            variant="ghost"
            icon={<X className="h-4 w-4" />}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </form>
    </motion.div>
  )
}
