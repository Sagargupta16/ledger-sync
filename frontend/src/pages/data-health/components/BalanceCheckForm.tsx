import { type FormEvent, useId, useState } from 'react'

import { Button, Input } from '@/components/ui'
import { cn } from '@/lib/cn'
import type { BalanceCheckInput } from '@/services/api/balanceChecks'

import { EARLIEST_CHECK_DAY, formatInr, isCheckDay, parseAmount } from '../balanceCheckInput'
import type { WriteResult } from '../useBalanceCheckActions'

interface BalanceCheckFormProps {
  /** Today's IST day; the latest day a check can name. */
  readonly today: string
  readonly initialDay: string
  /** Unsigned amount text; empty for a new check. */
  readonly initialAmount: string
  /** Start with Owed on: a card, or a loan the ledger shows as owed (`startsOwed`). */
  readonly initialNegative: boolean
  readonly submitLabel: string
  readonly onSubmit: (input: BalanceCheckInput) => Promise<WriteResult>
  /** Runs after a successful save. Without it, the form clears the amount instead. */
  readonly onSaved?: () => void
  readonly onCancel?: () => void
}

const TOGGLE_CLASS =
  'inline-flex min-h-11 shrink-0 items-center rounded-lg border px-3 text-xs font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:pointer-fine:min-h-8'

/**
 * Day plus the amount the bank shows. The sign lives in the Owed switch, not
 * in the text: a phone's decimal keypad has no minus key, and card apps show
 * dues as a positive number that the ledger carries as negative.
 */
export default function BalanceCheckForm({
  today,
  initialDay,
  initialAmount,
  initialNegative,
  submitLabel,
  onSubmit,
  onSaved,
  onCancel,
}: BalanceCheckFormProps) {
  const id = useId()
  const [day, setDay] = useState(initialDay)
  const [amount, setAmount] = useState(initialAmount)
  const [negative, setNegative] = useState(initialNegative)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const parsed = parseAmount(amount, negative)

  const handleAmount = (value: string) => {
    // A typed minus (desktop) switches Owed on rather than staying in the text.
    if (value.includes('-')) {
      setNegative(true)
      setAmount(value.replaceAll('-', ''))
      return
    }
    setAmount(value)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isCheckDay(day, today)) {
      setError('Pick a day between Jan 1, 2000 and today.')
      return
    }
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setError(null)
    setIsSaving(true)
    const result = await onSubmit({ check_date: day, balance: parsed.value })
    setIsSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (onSaved) onSaved()
    else setAmount('')
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3" noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <Input
          id={`${id}-day`}
          label="Day"
          type="date"
          min={EARLIEST_CHECK_DAY}
          max={today}
          value={day}
          onChange={(event) => setDay(event.target.value)}
          required
        />
        <Input
          id={`${id}-amount`}
          label="Balance the bank shows (INR)"
          inputMode="decimal"
          autoComplete="off"
          placeholder="52,340.50"
          value={amount}
          onChange={(event) => handleAmount(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          aria-pressed={negative}
          onClick={() => setNegative((value) => !value)}
          className={cn(
            TOGGLE_CLASS,
            negative
              ? 'border-app-red/50 bg-app-red/10 text-app-red'
              : 'border-[var(--hairline-2)] text-foreground hover:bg-[var(--overlay-2)]',
          )}
        >
          Owed or overdrawn
        </button>
        <p className="min-w-0 flex-1 text-xs tabular-nums text-text-tertiary">
          {parsed.ok
            ? `Saved as ${formatInr(parsed.value)}`
            : 'Card dues and overdrafts are saved as negative amounts.'}
        </p>
      </div>
      {error && (
        <p className="text-xs text-app-red" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" isLoading={isSaving}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
