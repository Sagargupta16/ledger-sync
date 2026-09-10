import { useState } from 'react'

import { AnimatePresence, motion } from 'motion/react'
import { Save, X } from 'lucide-react'

import { Button, Input } from '@/components/ui'
import { DISCLOSURE_TRANSITION } from '@/constants/animations'
import { formatCurrencyCompact } from '@/lib/formatters'

export default function UpdateProgressForm({
  goalId,
  currentAmount,
  targetAmount,
  isPending = false,
  error,
  onSave,
  onCancel,
}: Readonly<{
  goalId: number
  currentAmount: number
  targetAmount: number
  isPending?: boolean
  error?: string | null
  onSave: (goalId: number, amount: number) => void
  onCancel: () => void
}>) {
  const [value, setValue] = useState(String(currentAmount))
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleSave = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isPending) return
    const numValue = Number(value)
    if (!value.trim() || !Number.isFinite(numValue) || numValue < 0) {
      setValidationError('Enter zero or a positive amount.')
      return
    }
    setValidationError(null)
    onSave(goalId, numValue)
  }

  return (
    <AnimatePresence mode="popLayout" propagate>
      <motion.div
        {...DISCLOSURE_TRANSITION}
        className="overflow-hidden"
      >
        <form
          onSubmit={handleSave}
          aria-label="Update goal progress"
          aria-busy={isPending}
          className="mt-4 space-y-3 border-t border-border/50 pt-4"
        >
          <p id={`allocation-help-${goalId}`} className="text-sm text-text-secondary">
            Enter the total set aside toward {formatCurrencyCompact(targetAmount)}.
            This replaces the saved allocation and does not move money.
          </p>
          <fieldset disabled={isPending} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                id={`allocation-${goalId}`}
                label="Allocated amount"
                type="number"
                inputMode="decimal"
                min={0}
                max="9999999999999.99"
                step="0.01"
                required
                aria-describedby={`allocation-help-${goalId}`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                isLoading={isPending}
                icon={<Save className="h-3.5 w-3.5" />}
              >
                {isPending ? 'Saving...' : 'Save progress'}
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
          </fieldset>
          {(validationError || error) && (
            <p role="alert" className="text-sm text-app-red">{validationError || error}</p>
          )}
        </form>
      </motion.div>
    </AnimatePresence>
  )
}
