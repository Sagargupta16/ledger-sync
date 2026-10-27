import { useState } from 'react'

import { Button, Money } from '@/components/ui'
import { formatDate } from '@/lib/formatters'
import type { BalanceCheckResult } from '@/services/api/balanceChecks'

import { amountText, formatInr } from '../balanceCheckInput'
import { differenceText, looksSignFlipped } from '../balanceCheckUtils'
import type { BalanceCheckActions } from '../useBalanceCheckActions'
import BalanceCheckForm from './BalanceCheckForm'
import BalanceStatusDot from './BalanceStatusDot'

interface BalanceCheckItemProps {
  readonly check: BalanceCheckResult
  readonly tolerance: number
  readonly today: string
  readonly actions: BalanceCheckActions
}

type Mode = 'view' | 'edit' | 'confirm-delete'

/**
 * One recorded check: the bank's figure, how far the ledger is from it at the
 * end of that day, and in-place edit and delete. Delete asks once in place
 * rather than in a dialog, so the thumb never leaves the row on a phone.
 */
export default function BalanceCheckItem({ check, tolerance, today, actions }: BalanceCheckItemProps) {
  const [mode, setMode] = useState<Mode>('view')
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const day = formatDate(check.check_date)

  if (mode === 'edit') {
    return (
      <BalanceCheckForm
        today={today}
        initialDay={check.check_date}
        initialAmount={amountText(check.balance)}
        initialNegative={check.balance < 0}
        submitLabel="Save changes"
        onSubmit={(input) => actions.update(check.id, input)}
        onSaved={() => setMode('view')}
        onCancel={() => setMode('view')}
      />
    )
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    setError(null)
    const result = await actions.remove(check.id)
    setIsDeleting(false)
    // On success the refetched list no longer holds this row.
    if (!result.ok) {
      setMode('view')
      setError(result.error)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <BalanceStatusDot status={check.matches ? 'matched' : 'mismatch'} className="mt-1.5" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium text-foreground">{day}</p>
          <p className={`text-xs ${check.matches ? 'text-app-green' : 'text-app-red'}`}>
            {differenceText(check)}
          </p>
          {!check.matches && (
            <p className="text-xs text-text-tertiary">
              Ledger at the end of that day: <Money value={check.ledger_balance} formatter={formatInr} />
            </p>
          )}
          {looksSignFlipped(check, tolerance) && (
            <p className="text-xs text-warning-text">
              The two agree with the sign flipped. Edit the check and switch Owed on or off.
            </p>
          )}
        </div>
        <Money value={check.balance} formatter={formatInr} />
      </div>

      {mode === 'confirm-delete' ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Delete the ${day} check?`}>
          <span className="text-xs text-foreground">Delete this check?</span>
          <Button variant="danger" size="sm" isLoading={isDeleting} onClick={() => void handleDelete()}>
            Delete
          </Button>
          <Button variant="ghost" size="sm" disabled={isDeleting} onClick={() => setMode('view')}>
            Keep
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setMode('edit')} aria-label={`Edit the ${day} check`}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode('confirm-delete')}
            aria-label={`Delete the ${day} check`}
          >
            Delete
          </Button>
        </div>
      )}

      {error && (
        <p className="text-xs text-app-red" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
