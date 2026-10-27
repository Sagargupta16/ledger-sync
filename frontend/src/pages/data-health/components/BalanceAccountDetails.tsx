import { getTodayKey } from '@/lib/dateUtils'
import { formatDate, getActiveLocale } from '@/lib/formatters'
import type { AccountBalanceHealth } from '@/services/api/balanceChecks'

import { formatInr } from '../balanceCheckInput'
import type { BalanceCheckActions } from '../useBalanceCheckActions'
import BalanceCheckForm from './BalanceCheckForm'
import BalanceCheckHistory from './BalanceCheckHistory'
import MonthCoverageGrid from './MonthCoverageGrid'

interface BalanceAccountDetailsProps {
  readonly health: AccountBalanceHealth
  readonly tolerance: number
  readonly asOf: string
  /** Whether a new check starts with Owed on (`startsOwed`). */
  readonly owedByDefault: boolean
  readonly actions: BalanceCheckActions
}

/**
 * The open account: record today's figure first (the common job), then the
 * checks already recorded, then which months the ledger covers.
 */
export default function BalanceAccountDetails({
  health,
  tolerance,
  asOf,
  owedByDefault,
  actions,
}: BalanceAccountDetailsProps) {
  const today = getTodayKey()
  const range =
    health.first_date && health.last_date
      ? `${formatDate(health.first_date)} to ${formatDate(health.last_date)}`
      : 'No rows'

  return (
    <div className="space-y-5 px-2 pb-4 pt-2">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-text-tertiary">Rows</dt>
          <dd className="font-medium tabular-nums text-foreground">
            {health.transaction_count.toLocaleString(getActiveLocale())}
          </dd>
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <dt className="text-text-tertiary">First to last row</dt>
          <dd className="break-words font-medium text-foreground">{range}</dd>
        </div>
      </dl>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-foreground">Record what the bank shows</h3>
        <p className="text-xs leading-5 text-text-tertiary">
          The balance at the end of the day you pick, that day&apos;s rows included. Within{' '}
          {formatInr(tolerance)} of the ledger counts as a match. Amounts here are in rupees.
        </p>
        <BalanceCheckForm
          today={today}
          initialDay={today}
          initialAmount=""
          initialNegative={owedByDefault}
          submitLabel="Save check"
          onSubmit={(input) => actions.record(health.account, input)}
        />
      </div>

      <BalanceCheckHistory
        checks={health.checks}
        tolerance={tolerance}
        today={today}
        actions={actions}
      />

      <MonthCoverageGrid health={health} asOf={asOf} />
    </div>
  )
}
