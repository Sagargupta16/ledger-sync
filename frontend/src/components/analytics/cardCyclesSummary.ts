import { formatCurrency, formatDate } from '@/lib/formatters'
import type {
  CardCycleCard,
  CardCycleStatus,
  CardCyclesResponse,
  SkippedCard,
} from '@/services/api/cardCycles'

const UNPAID: ReadonlySet<CardCycleStatus> = new Set(['due', 'partial', 'overdue'])
const NAMES_SHOWN = 3
/** The backend's rounding slack (`PAID_TOLERANCE`): smaller carries are noise. */
const CARRY_SLACK = 1

/** A statement that still needs money: due, part paid, or overdue. */
export const isUnpaid = (status: CardCycleStatus): boolean => UNPAID.has(status)

export const STATUS_LABEL: Record<CardCycleStatus, string> = {
  open: 'Open cycle',
  nothing_due: 'Nothing due',
  paid: 'Paid',
  partial: 'Part paid',
  due: 'Due',
  overdue: 'Overdue',
  rolled_over: 'Rolled over',
}

/** Static class pairs, so Tailwind can see every one of them. */
export const STATUS_TONE: Record<CardCycleStatus, string> = {
  open: 'bg-app-purple/15 text-app-purple',
  nothing_due: 'bg-[var(--overlay-4)] text-muted-foreground',
  paid: 'bg-app-green/15 text-app-green',
  partial: 'bg-app-yellow/15 text-app-yellow',
  due: 'bg-app-purple/15 text-app-purple',
  overdue: 'bg-app-red/15 text-app-red',
  rolled_over: 'bg-[var(--overlay-4)] text-muted-foreground',
}

export const shortDate = (dateKey: string): string =>
  formatDate(dateKey, { month: 'short', day: 'numeric' })

export function dueInLabel(days: number): string {
  if (days < 0) return `${-days} ${days === -1 ? 'day' : 'days'} overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `In ${days} days`
}

export interface NextDue {
  readonly card: string
  readonly date: string
  readonly days: number
  /** False when no statement is unpaid and this is an open cycle's due date. */
  readonly billed: boolean
}

export interface CardCyclesSummary {
  readonly dueTotal: number
  readonly unpaidCount: number
  readonly overdueCount: number
  readonly unbilledTotal: number
  readonly next: NextDue | null
  /** Sum over paying accounts; null when no card names a paying account. */
  readonly cashAfterDues: number | null
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)
const byDueDate = (a: NextDue, b: NextDue) => a.date.localeCompare(b.date) || a.card.localeCompare(b.card)

export function summarizeCardCycles(data: CardCyclesResponse): CardCyclesSummary {
  const unpaid = data.cards.filter((card) => isUnpaid(card.status))
  const billed = unpaid.map(
    (card): NextDue => ({ card: card.name, date: card.due_date, days: card.days_to_due, billed: true }),
  )
  const open = data.cards
    .filter((card) => card.unbilled_amount > 0)
    .map(
      (card): NextDue => ({
        card: card.name,
        date: card.next_due_date,
        days: card.days_to_next_due,
        billed: false,
      }),
    )
  const [next = null] = billed.length > 0 ? billed.sort(byDueDate) : open.sort(byDueDate)
  const paying = data.paying_accounts
  return {
    dueTotal: sum(unpaid.map((card) => card.due_amount)),
    unpaidCount: unpaid.length,
    overdueCount: unpaid.filter((card) => card.status === 'overdue').length,
    unbilledTotal: sum(data.cards.map((card) => card.unbilled_amount)),
    next,
    cashAfterDues: paying.length > 0 ? sum(paying.map((account) => account.cash_after_dues)) : null,
  }
}

function nameList(names: readonly string[]): string {
  if (names.length <= NAMES_SHOWN) return names.join(', ')
  return `${names.slice(0, NAMES_SHOWN).join(', ')} and ${names.length - NAMES_SHOWN} more`
}

/**
 * An unpaid bill that took over money from earlier statements. Payments since
 * the close pay the oldest money first, so once they reach the carried amount
 * it was only paid late. Below that, a payment missing from the ledger (or
 * recorded on another account) is the usual cause.
 */
function carryNote(card: CardCycleCard): string | null {
  if (!isUnpaid(card.status) || card.carried_in - card.paid_amount <= CARRY_SLACK) return null
  const since = shortDate(card.cycles[1].period_start)
  return `${card.name}: this bill includes ${formatCurrency(card.carried_in)} still owed from statements before ${since}. If you paid that, the payment is missing from the ledger.`
}

/** Carried balances, then one sentence per reason a card has no cycle or no paying account. */
export function panelNotes(cards: readonly CardCycleCard[], skipped: readonly SkippedCard[]): string[] {
  const named = (reason: SkippedCard['reason']) =>
    skipped.filter((card) => card.reason === reason).map((card) => card.name)
  const notes = cards.map(carryNote).filter((note): note is string => note !== null)
  const missing = named('no_settings')
  if (missing.length > 0) {
    notes.push(
      `No statement or payment day yet for ${nameList(missing)}. Only a Money Manager backup import carries card days.`,
    )
  }
  const closed = named('closed')
  if (closed.length > 0) notes.push(`Closed and left out: ${nameList(closed)}.`)
  const unpaired = cards.filter((card) => card.paying_account === null).map((card) => card.name)
  if (unpaired.length > 0) {
    notes.push(
      `No paying account set for ${nameList(unpaired)}, so ${unpaired.length === 1 ? 'its dues are' : 'their dues are'} left out of cash after dues.`,
    )
  }
  return notes
}
