/**
 * Pieces of SafeToSpendCard: the breakdown under the figure, the spending pace
 * bar, the low-balance notice and the notes that explain a figure's basis.
 */

import type { ReactNode } from 'react'

import { AlertTriangle, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router'

import ProgressBar from '@/components/shared/ProgressBar'
import { Money } from '@/components/ui'
import { ROUTES } from '@/constants'
import { colors } from '@/constants/colors'
import { addDaysToKey } from '@/lib/dateUtils'
import { formatCurrencyCompact, formatDate, getOrdinalSuffix } from '@/lib/formatters'
import type { LowBalanceWarning, SafeToSpend, SpendPace } from '@/services/api/safeToSpend'

const LINK_CLASS =
  'inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]'

/** The projection's name for the sum of every account (`_series("Total", ...)`). */
const PROJECTION_TOTAL = 'Total'
const shortDate = (key: string) => formatDate(key, { month: 'short', day: 'numeric' })
const ordinal = (day: number) => `${day}${getOrdinalSuffix(day)}`
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Where the figure comes from: cash in hand, less what is already promised. */
export function SafeToSpendBreakdown({ data }: Readonly<{ data: SafeToSpend }>) {
  const rows = [
    { label: 'Cash, bank and wallets', value: data.liquid.gross, sign: '' },
    { label: 'Card dues and overdrafts', value: data.liquid.liabilities, sign: '-' },
    { label: `Bills before payday (${data.bill_count})`, value: data.bills_before_payday, sign: '-' },
    { label: 'Held for later bills', value: data.reserve.amount, sign: '-' },
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="text-xs leading-5 text-muted-foreground">{row.label}</dt>
          <dd className="text-sm">
            {row.sign && row.value > 0 && <span aria-hidden="true" className="text-muted-foreground">- </span>}
            <Money value={row.value} formatter={formatCurrencyCompact} muted={row.value === 0} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Discretionary spend so far against an even pace through the cycle's allowance. */
export function PaceBar({ pace }: Readonly<{ pace: SpendPace }>) {
  const ahead = pace.spent > pace.expected
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
        <span className="font-medium text-foreground">Spent this cycle, bills left out</span>
        <span className="text-muted-foreground">
          <Money value={pace.spent} formatter={formatCurrencyCompact} /> of{' '}
          <Money value={pace.budget} formatter={formatCurrencyCompact} muted />
        </span>
      </div>
      <ProgressBar
        value={pace.spent}
        max={Math.max(pace.budget, pace.spent)}
        target={pace.expected}
        color={ahead ? colors.app.orange : colors.app.green}
        ariaLabel={`Spent ${formatCurrencyCompact(pace.spent)} of ${formatCurrencyCompact(pace.budget)} this cycle`}
      />
      <p className="text-xs leading-5 text-muted-foreground">
        {ahead ? 'Ahead of' : 'Within'} an even pace of {formatCurrencyCompact(pace.expected)} by{' '}
        {shortDate(pace.as_of)}, day {pace.elapsed_days} of {pace.total_days}.
        {pace.usual !== null && ` You usually spend ${formatCurrencyCompact(pace.usual)} by this point.`}
      </p>
    </div>
  )
}

/** The first account the 30-day projection sees crossing below zero or the threshold. */
export function LowBalanceNotice({ warning, threshold }: Readonly<{ warning: LowBalanceWarning; threshold: number }>) {
  const zero = warning.kind === 'below_zero'
  const level = zero ? 'zero' : formatCurrencyCompact(threshold)
  const reach = warning.balance < 0
    ? `short by ${formatCurrencyCompact(-warning.balance)}`
    : `reaching ${formatCurrencyCompact(warning.balance)}`
  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs leading-5 ${zero ? 'border-app-red/30 bg-app-red/5' : 'border-app-orange/30 bg-app-orange/5'}`}
    >
      <AlertTriangle aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${zero ? 'text-app-red' : 'text-app-orange'}`} />
      <p className="min-w-0 text-foreground">
        {/* Named as an account, so an account called "Cash" never reads as all your cash. */}
        {warning.account === PROJECTION_TOTAL ? (
          'Your total cash'
        ) : (
          <>
            The <span className="font-medium">{warning.account}</span> account
          </>
        )}{' '}
        is projected to fall below {level} on {shortDate(warning.date)}, {reach}.
      </p>
    </div>
  )
}

function Note({ children, settings = false }: Readonly<{ children: ReactNode; settings?: boolean }>) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 text-xs leading-5 text-muted-foreground">
      <span className="min-w-0 py-1">{children}</span>
      {settings && (
        <Link to={ROUTES.SETTINGS} className={LINK_CLASS}>
          Settings <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      )}
    </li>
  )
}

/** What the figure assumed: payday, data freshness, missing income, unclassified accounts. */
export function CardNotes({ data }: Readonly<{ data: SafeToSpend }>) {
  const { cycle, liquid, reserve } = data
  const defaultPayday = cycle.payday === null || cycle.payday === 1
  const stale = data.balance_as_of !== null && data.balance_as_of < addDaysToKey(data.as_of, -1)
  const notes: ReactNode[] = []
  if (cycle.payday === null) {
    notes.push(<Note key="payday" settings>Payday is not set, so this counts to the month end.</Note>)
  } else if (defaultPayday && cycle.detected_payday !== null && cycle.detected_payday !== 1) {
    notes.push(
      <Note key="payday" settings>
        Your main income usually arrives on the {ordinal(cycle.detected_payday)}. Set it as payday to count to that day.
      </Note>,
    )
  }
  if (stale && data.balance_as_of) {
    notes.push(<Note key="stale">Balances include transactions up to {shortDate(data.balance_as_of)}. Import newer ones for a current figure.</Note>)
  }
  if (reserve.status === 'no_recurring_income') {
    notes.push(<Note key="income">No recurring income found, so nothing is held back for bills after payday.</Note>)
  }
  if (liquid.unclassified_accounts > 0) {
    notes.push(
      <Note key="classify" settings>
        {plural(liquid.unclassified_accounts, 'account')} with a balance {liquid.unclassified_accounts === 1 ? 'is' : 'are'} not classified and left out.
      </Note>,
    )
  }
  return notes.length > 0 ? <ul className="space-y-0.5">{notes}</ul> : null
}
