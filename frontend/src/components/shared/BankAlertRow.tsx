import { Button, Money } from '@/components/ui'
import { formatDate } from '@/lib/formatters'
import type { BankAlert } from '@/services/api/bankAlerts'

interface BankAlertRowProps {
  readonly alert: BankAlert
  /** "Ignore" for a missing alert, "Restore" for an ignored one. */
  readonly actionLabel: string
  readonly onAction: () => void
  readonly isPending: boolean
  readonly disabled: boolean
}

function alertPayee(alert: BankAlert): string {
  return alert.merchant ?? (alert.direction === 'debit' ? 'Unknown payee' : 'Unknown sender')
}

/**
 * One alert: who, when and from which account or card, the amount, and its action.
 * The text keeps at least 10rem, so on narrow phones the amount and the button
 * wrap under it, right-aligned, instead of squeezing it.
 */
export default function BankAlertRow({ alert, actionLabel, onAction, isPending, disabled }: BankAlertRowProps) {
  const payee = alertPayee(alert)
  const source = [alert.bank, alert.account_tail ? `ending ${alert.account_tail}` : null]
    .filter((part): part is string => Boolean(part))
    .join(' ')
  const isDebit = alert.direction === 'debit'

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <div className="min-w-0 flex-1 basis-40">
        <p className="break-words text-sm font-medium text-foreground">{payee}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
          <span>
            {isDebit ? 'Debit' : 'Credit'}, {formatDate(alert.occurred_on)}
            {source ? `, ${source}` : ''}
          </span>
          {alert.status === 'missing' && alert.after_last_import && (
            <span className="rounded-full border border-[var(--hairline-2)] px-2 py-0.5 text-[11px] font-medium text-text-secondary">
              After last backup
            </span>
          )}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <Money value={alert.amount} className={isDebit ? 'text-app-red' : 'text-app-green'} />
        <Button
          variant="outline"
          size="sm"
          onClick={onAction}
          disabled={disabled}
          isLoading={isPending}
          aria-label={`${actionLabel} the ${isDebit ? 'debit' : 'credit'} alert for ${payee}`}
        >
          {actionLabel}
        </Button>
      </div>
    </li>
  )
}
