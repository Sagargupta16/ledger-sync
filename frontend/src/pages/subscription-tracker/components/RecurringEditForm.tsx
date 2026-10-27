import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button, Input, Select } from '@/components/ui'
import type { RecurringTransaction } from '@/hooks/api/useAnalyticsV2'
import { BASE_CURRENCY } from '@/constants/currencies'

import { FREQUENCY_OPTIONS } from '../constants'

export interface RecurringEditPatch {
  pattern_name: string
  frequency: string
  expected_amount?: number
}

export function RecurringEditForm({
  item,
  onSave,
  onCancel,
}: Readonly<{
  item: RecurringTransaction
  onSave: (patch: RecurringEditPatch) => void
  onCancel: () => void
}>) {
  const shownAmount = Math.abs(item.expected_amount)
  const [editName, setEditName] = useState(item.name)
  const [editFreq, setEditFreq] = useState(item.frequency ?? 'monthly')
  const [editAmt, setEditAmt] = useState(String(shownAmount))

  const saveEdit = () => {
    const amt = Number(editAmt)
    if (!editName.trim()) {
      toast.error('Name is required')
      return
    }
    if (Number.isNaN(amt) || amt <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    // A sent amount becomes the user's own, kept beside the detected one, so
    // resending the shown figure on a rename would pin a copy of it.
    onSave({
      pattern_name: editName.trim(),
      frequency: editFreq,
      ...(amt === shownAmount ? {} : { expected_amount: amt }),
    })
  }

  return (
    <div className="ledger-panel space-y-3 border-app-blue/30 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Input
            id={`e-n-${item.id}`}
            label="Name"
            type="text"
            value={editName}
            onChange={(event) => setEditName(event.target.value)}
            autoFocus
          />
        </div>
        <Select
          id={`e-f-${item.id}`}
          label="Frequency"
          value={editFreq}
          onChange={(event) => setEditFreq(event.target.value)}
          options={FREQUENCY_OPTIONS}
        />
      </div>
      <div className="w-full sm:max-w-[200px]">
        <Input
          id={`e-a-${item.id}`}
          // Amounts are stored in the base currency, whatever the display currency.
          label={`Amount (${BASE_CURRENCY})`}
          type="number"
          min={0}
          step="any"
          value={editAmt}
          onChange={(event) => setEditAmt(event.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          icon={<Check className="h-3.5 w-3.5" />}
          onClick={saveEdit}
        >
          Save
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<X className="h-3.5 w-3.5" />}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
