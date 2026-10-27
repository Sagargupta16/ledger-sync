import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { Check, PencilLine, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button, Input, Money } from '@/components/ui'
import type { RecurringTransaction } from '@/hooks/api/useAnalyticsV2'
import { useRecurringAmount } from '@/hooks/api/useRecurringAmount'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import { formatCurrency } from '@/lib/formatters'
import { isCurrentSession } from '@/lib/session'
import { BASE_CURRENCY } from '@/constants/currencies'

import { toMonthlyAmount } from '../helpers'

function savedMessage(item: RecurringTransaction, next: number | null): string {
  if (next === null) return `${item.name} uses the detected amount`
  // Any edit confirms a detected commitment, so its Detected chip goes away.
  return !item.is_confirmed && item.pattern_kind !== 'habit'
    ? `Saved the amount and confirmed ${item.name}`
    : `Saved the amount for ${item.name}`
}

/**
 * A recurring item's amount per cycle, editable in place.
 *
 * The shown amount is the effective one. A saved edit is kept beside the
 * detected amount, so the next analytics refresh leaves it alone; while one is
 * set, the detected amount shows underneath with a Reset back to it. The input
 * takes the base currency the ledger stores, whatever the display currency.
 */
export function RecurringAmount({ item }: Readonly<{ item: RecurringTransaction }>) {
  const amountMutation = useRecurringAmount()
  const { guardDemoAction } = useDemoGuard()
  const [draft, setDraft] = useState<string | null>(null)
  const amountButton = useRef<HTMLButtonElement>(null)
  // Set when the focused control is about to go away (the editor closing, the
  // Reset row after a reset), so focus lands back on the amount.
  const returnFocus = useRef(false)

  const amount = Math.abs(item.expected_amount)
  const tone = item.type === 'Income' ? 'text-app-green' : 'text-app-red'
  const detected =
    item.amount_edited && item.detected_amount != null ? Math.abs(item.detected_amount) : null
  const saving = amountMutation.isPending
  const editing = draft !== null
  const showsDetected = detected !== null

  useEffect(() => {
    if (editing || !returnFocus.current) return
    returnFocus.current = false
    // Only when focus went down with the removed control, never away from
    // something the user moved to meanwhile.
    const active = document.activeElement
    if (!active || active === document.body) amountButton.current?.focus()
  }, [editing, showsDetected])

  const submit = (next: number | null) => {
    if (guardDemoAction(next === null ? 'Resetting recurring amounts' : 'Editing recurring amounts')) {
      setDraft(null)
      return
    }
    // A failure keeps the draft open; the global mutation handler toasts why.
    amountMutation.mutate({ id: item.id, amount: next }, {
      onSuccess: (_result, _change, signal) => {
        if (!signal || !isCurrentSession(signal)) return
        setDraft(null)
        toast.success(savedMessage(item, next))
      },
    })
  }

  const handleSave = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = Number(draft)
    if (!draft?.trim() || !Number.isFinite(value) || value <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    if (value === amount) {
      setDraft(null)
      return
    }
    submit(value)
  }

  if (draft !== null) {
    return (
      <form onSubmit={handleSave} className="flex items-center gap-1">
        <div className="w-36">
          <Input
            id={`recurring-amount-${item.id}`}
            aria-label={`Amount per cycle for ${item.name} in ${BASE_CURRENCY}`}
            icon={<span className="text-xs font-medium">{BASE_CURRENCY}</span>}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !saving) setDraft(null)
            }}
            disabled={saving}
            autoFocus
          />
        </div>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          icon={<Check className="h-4 w-4" />}
          isLoading={saving}
          aria-label="Save amount"
          title="Save amount"
          className="text-app-green hover:bg-app-green/10"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<X className="h-4 w-4" />}
          disabled={saving}
          onClick={() => setDraft(null)}
          aria-label="Cancel amount edit"
          title="Cancel"
        />
      </form>
    )
  }

  return (
    // Phones stack this block at the card's left edge, so it aligns left there.
    <div className="flex flex-col items-start sm:items-end">
      <button
        ref={amountButton}
        type="button"
        onClick={() => {
          returnFocus.current = true
          setDraft(String(amount))
        }}
        aria-label={`Edit amount for ${item.name}, ${formatCurrency(amount)} per cycle`}
        title="Edit amount"
        className="group -mx-1 inline-flex min-h-11 touch-manipulation items-center gap-1.5 rounded-md px-1 transition-colors hover:bg-[var(--ledger-control-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:pointer-fine:min-h-0"
      >
        <Money value={amount} bold className={`text-base font-bold ${tone}`} />
        <PencilLine aria-hidden="true" className="h-3 w-3 shrink-0 text-text-tertiary transition-colors group-hover:text-foreground" />
      </button>
      <p className="whitespace-nowrap text-[11px] text-muted-foreground tabular-nums">
        {formatCurrency(toMonthlyAmount(item.expected_amount, item.frequency))}/mo
      </p>
      {detected !== null && (
        <div className="flex items-center gap-1 text-[11px] text-text-tertiary">
          <span className="whitespace-nowrap">Detected</span>
          <Money value={detected} muted className="text-[11px] font-normal" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<RotateCcw className="h-3 w-3" />}
            isLoading={saving}
            onClick={() => {
              returnFocus.current = true
              submit(null)
            }}
            aria-label={`Reset ${item.name} to the detected amount`}
            title="Use the detected amount"
            className="px-1.5 text-[11px]"
          >
            Reset
          </Button>
        </div>
      )}
    </div>
  )
}
