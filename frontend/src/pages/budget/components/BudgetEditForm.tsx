import { useId, useState } from 'react'

import { AnimatePresence, motion } from 'motion/react'
import { Save, X } from 'lucide-react'

import { Button, Input } from '@/components/ui'
import { DISCLOSURE_TRANSITION } from '@/constants/animations'
import { BASE_CURRENCY } from '@/constants/currencies'
import type { Budget } from '@/services/api/analyticsV2'
import type { UpdateBudgetRequest } from '@/services/api/analyticsV2Planning'

interface Props {
  readonly budget: Budget
  readonly label: string
  readonly isPending: boolean
  readonly error: string | null
  readonly onSave: (patch: UpdateBudgetRequest) => void
  readonly onCancel: () => void
}

/**
 * Inline editor for one budget's monthly limit and alert threshold. Only the
 * changed fields are sent; the browser's own constraint check matches the
 * endpoint's bounds (limit from 0.01, threshold 0 to 100).
 */
export default function BudgetEditForm({ budget, label, isPending, error, onSave, onCancel }: Props) {
  const id = useId()
  const [limit, setLimit] = useState(String(budget.monthly_limit))
  const [threshold, setThreshold] = useState(String(budget.alert_threshold))

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isPending || !event.currentTarget.reportValidity()) return
    const patch: UpdateBudgetRequest = {}
    if (Number(limit) !== budget.monthly_limit) patch.monthly_limit = Number(limit)
    if (Number(threshold) !== budget.alert_threshold) patch.alert_threshold = Number(threshold)
    onSave(patch)
  }

  return (
    <AnimatePresence mode="popLayout" propagate>
      <motion.div
        {...DISCLOSURE_TRANSITION}
        // Renders only while open, so its open flag is always true.
        layoutDependency
        className="overflow-hidden"
      >
        <form
          onSubmit={handleSubmit}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onCancel()
          }}
          aria-label={`Edit the ${label} budget`}
          aria-busy={isPending}
          className="mt-3 border-t border-[var(--hairline-1)] pt-3"
        >
          <fieldset
            disabled={isPending}
            className="grid min-w-0 grid-cols-2 gap-3 border-0 p-0 sm:grid-cols-[minmax(0,13rem)_minmax(0,9rem)_auto] sm:items-end"
          >
            <legend className="sr-only">Monthly limit and alert threshold</legend>
            <Input
              id={`${id}-limit`}
              label={`Monthly limit (${BASE_CURRENCY})`}
              type="number"
              inputMode="decimal"
              min="0.01"
              max="9999999999999.99"
              step="0.01"
              required
              autoFocus
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
            />
            <Input
              id={`${id}-alert`}
              label="Alert at (%)"
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="any"
              required
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
            />
            <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-1">
              <Button type="submit" size="sm" isLoading={isPending} icon={<Save className="size-3.5" />}>
                {isPending ? 'Saving...' : 'Save'}
              </Button>
              <Button type="button" variant="secondary" size="sm" icon={<X className="size-3.5" />} onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </fieldset>
          {error && <p role="alert" className="mt-2 text-sm text-app-red">{error}</p>}
        </form>
      </motion.div>
    </AnimatePresence>
  )
}
