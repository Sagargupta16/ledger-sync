/**
 * Pure helpers for the balance-check panel: status presentation, display
 * order, the one-line verdict per account, and the hints and defaults read
 * off an account's checks. The form's own input and rupee formatting live in
 * `balanceCheckInput.ts`.
 *
 * The verdicts themselves come from the server (`account_status` in backend
 * `core/balance_checks.py`); nothing here re-decides a status.
 */

import { inclusiveDaySpan } from '@/lib/dateUtils'
import { formatDate, getActiveLocale } from '@/lib/formatters'
import type { AccountTypeValue } from '@/services/api/accountClassifications'
import type {
  AccountBalanceHealth,
  BalanceCheckResult,
  BalanceStatus,
} from '@/services/api/balanceChecks'

import { formatInr } from './balanceCheckInput'

interface StatusMeta {
  /** Short word for the tally chip, e.g. "2 off". */
  readonly tally: string
  /** Classes for the dot itself. */
  readonly dot: string
  /** Text colour for the verdict line. */
  readonly text: string
}

export const STATUS_META: Record<BalanceStatus, StatusMeta> = {
  mismatch: { tally: 'off', dot: 'bg-app-red', text: 'text-app-red' },
  changed: { tally: 'changed since the check', dot: 'bg-app-yellow', text: 'text-warning-text' },
  // Hollow, so "no claim yet" never reads as the filled grey of an idle account.
  unchecked: {
    tally: 'never checked',
    dot: 'border-[1.5px] border-text-quaternary bg-transparent',
    text: 'text-text-tertiary',
  },
  matched: { tally: 'match', dot: 'bg-app-green', text: 'text-app-green' },
  idle: { tally: 'idle', dot: 'bg-text-quaternary', text: 'text-text-tertiary' },
}

/**
 * Accounts you check come first: a mismatch, then one that moved since its
 * check, then the ones that match. Never-checked accounts follow, so the few
 * accounts you do check are not buried under the many you never will.
 */
export const STATUS_ORDER: readonly BalanceStatus[] = [
  'mismatch',
  'changed',
  'matched',
  'unchecked',
  'idle',
]

const CREDIT_CARD: AccountTypeValue = 'Credit Cards'
const LOAN: AccountTypeValue = 'Loans/Lended'

/**
 * Split accounts into the main list and the quiet group (idle or closed), each
 * ordered by `STATUS_ORDER` and then by name. A mismatch always stays in the
 * main list: a closed account that does not reconcile is still wrong.
 */
export function groupForDisplay(accounts: readonly AccountBalanceHealth[]) {
  const rank = (a: AccountBalanceHealth) => STATUS_ORDER.indexOf(a.status)
  const ordered = [...accounts].sort((a, b) => rank(a) - rank(b))
  const isQuiet = (a: AccountBalanceHealth) =>
    a.status === 'idle' || (a.is_closed && a.status !== 'mismatch')
  return {
    primary: ordered.filter((a) => !isQuiet(a)),
    quiet: ordered.filter(isQuiet),
  }
}

/** Whole days from `fromKey` to `toKey` (`YYYY-MM-DD`), 0 on the same day. */
export function daysBetween(fromKey: string, toKey: string): number {
  return fromKey >= toKey ? 0 : inclusiveDaySpan(fromKey, toKey) - 1
}

function plural(n: number, word: string): string {
  return `${n.toLocaleString(getActiveLocale())} ${word}${n === 1 ? '' : 's'}`
}

/** The verdict line under an account name, in the status colour. */
export function statusLine(health: AccountBalanceHealth, asOf: string): string {
  const latest = health.checks.at(0)
  switch (health.status) {
    case 'mismatch':
      return latest
        ? `Off by ${formatInr(Math.abs(latest.difference))} on ${formatDate(latest.check_date)}`
        : 'Does not match the bank'
    case 'changed':
      return latest
        ? `${plural(health.rows_after_check, 'row')} dated after the ${formatDate(latest.check_date)} check`
        : 'Rows added since the last check'
    case 'matched':
      return latest ? `Matches the bank on ${formatDate(latest.check_date)}` : 'Matches the bank'
    case 'idle':
      // The server's own anchor: a row dated after `asOf` never counts as activity.
      return health.last_activity
        ? `No rows or checks for ${plural(daysBetween(health.last_activity, asOf), 'day')}`
        : 'No recent activity'
    case 'unchecked':
      return 'Never checked against the bank'
  }
}

/** How a check's difference reads, without making the user decode a sign. */
export function differenceText(check: BalanceCheckResult): string {
  if (check.matches) return 'Matches the ledger'
  const gap = formatInr(Math.abs(check.difference))
  return check.difference > 0 ? `Ledger is ${gap} below the bank` : `Ledger is ${gap} above the bank`
}

/**
 * True when the two amounts agree once the sign is flipped: the usual slip
 * on a card, where the app shows dues as a positive number but the ledger
 * carries them as negative.
 */
export function looksSignFlipped(check: BalanceCheckResult, tolerance: number): boolean {
  return !check.matches && check.balance !== 0 && Math.abs(check.balance + check.ledger_balance) <= tolerance
}

/**
 * The gap every check shares, when there are two or more, none matches and
 * their differences agree within the tolerance: the usual sign of an opening
 * balance the ledger never got. The newest check's figure; `null` otherwise.
 */
export function sharedGap(checks: readonly BalanceCheckResult[], tolerance: number): number | null {
  if (checks.length < 2 || checks.some((check) => check.matches)) return null
  const gaps = checks.map((check) => check.difference)
  return Math.max(...gaps) - Math.min(...gaps) <= tolerance ? checks[0].difference : null
}

/**
 * Whether a new check starts with Owed on: for a card, and for a loan the
 * ledger shows as owed (the type also covers money lent out). Not for any
 * other negative balance: a bank account whose imported history starts after
 * it was opened can read negative while its bank shows a positive figure.
 */
export function startsOwed(health: AccountBalanceHealth, accountType: string | undefined): boolean {
  if (accountType === CREDIT_CARD) return true
  return accountType === LOAN && health.ledger_balance < 0
}

/**
 * Account type by account name, ignoring case the way the server matches
 * account labels. `classifications` is the `/api/account-classifications` map.
 */
export function accountTypeLookup(
  classifications: Readonly<Record<string, string>> | undefined,
): (account: string) => string | undefined {
  const byName = new Map(
    Object.entries(classifications ?? {}).map(([name, type]) => [name.toLowerCase(), type]),
  )
  return (account) => byName.get(account.toLowerCase())
}
