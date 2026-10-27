import { addDaysToKey, addMonthsToKey, getDateKey, MS_PER_DAY } from '@/lib/dateUtils'
import type { CardCycle, CardCycleStatus } from '@/services/api/cardCycles'
import type { Transaction } from '@/types'

/**
 * The statement rules of backend `core/card_cycles.py` over the demo rows, for
 * a user who pays every bill. Two demo-only payments make that true. The
 * generator pays each month's card spend on the 25th but adds the life events
 * (trips, gadgets) afterwards, so those charges were never paid: each month's
 * payments are topped up to that month's spend less refunds. A refund after
 * the 25th still lowers that payment below the statement, so a statement that
 * is short on its due date is paid in full that day.
 */

const PAID_TOLERANCE = 1
/** The day the demo generator pays each card's monthly bill. */
const BILL_DAY = '25'

export interface Move {
  readonly day: string
  readonly charge: number
  readonly credit: number
  readonly payment: number
  readonly fromPaying: boolean
}

interface Period {
  readonly start: string
  readonly end: string
  readonly due: string
}

interface Settled {
  readonly paid: number
  readonly paidOn: string | null
  readonly fromPaying: boolean
}

const NOT_SETTLED: Settled = { paid: 0, paidOn: null, fromPaying: false }

export const round2 = (value: number) => Math.round(value * 100) / 100
const total = (moves: readonly Move[], pick: (move: Move) => number) =>
  moves.reduce((sum, move) => sum + pick(move), 0)
const spendOf = (move: Move) => move.charge - move.credit
const paymentOf = (move: Move) => move.payment
const payment = (day: string, amount: number): Move =>
  ({ day, charge: 0, credit: 0, payment: amount, fromPaying: true })

/** `day` in the month `months` after the month of `anchor` (demo card days are all below 29). */
const shifted = (anchor: string, months: number, day: number) =>
  addMonthsToKey(`${anchor.slice(0, 7)}-${String(day).padStart(2, '0')}`, months)

function dueDateAfter(statement: string, paymentDay: number): string {
  const due = shifted(statement, 0, paymentDay)
  return due > statement ? due : shifted(statement, 1, paymentDay)
}

export function daysBetween(from: string, to: string): number {
  const utc = (key: string) =>
    Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)))
  return Math.round((utc(to) - utc(from)) / MS_PER_DAY)
}

/** One card's demo rows up to `today` as charges, credits and payments. */
export function movesFor(txs: readonly Transaction[], card: string, payer: string, today: string): Move[] {
  const moves: Move[] = []
  const add = (day: string, part: Partial<Move>) =>
    moves.push({ day, charge: 0, credit: 0, payment: 0, fromPaying: false, ...part })
  for (const tx of txs) {
    const day = getDateKey(tx.date)
    const amount = Math.abs(tx.amount)
    if (day > today) continue
    if (tx.type === 'Transfer') {
      if (tx.from_account === tx.to_account) continue
      if (tx.from_account === card) add(day, { charge: amount })
      if (tx.to_account === card) add(day, { payment: amount, fromPaying: tx.from_account === payer })
    } else if (tx.account === card) {
      add(day, tx.type === 'Expense' ? { charge: amount } : { credit: amount })
    }
  }
  return moves
}

/** The rows plus a payment, on each month's bill day, of what that month's payments left unpaid. */
function withLifeEventsPaid(moves: readonly Move[], today: string): Move[] {
  const months = new Map<string, number>()
  for (const move of moves) {
    const month = move.day.slice(0, 7)
    months.set(month, (months.get(month) ?? 0) + spendOf(move) - move.payment)
  }
  const topUps = [...months]
    .filter(([month, short]) => short > PAID_TOLERANCE && `${month}-${BILL_DAY}` <= today)
    .map(([month, short]) => payment(`${month}-${BILL_DAY}`, short))
  return [...moves, ...topUps]
}

/** The backend's window: `closed` finished periods and then the open one, oldest first. */
function periodsFor(today: string, days: readonly [number, number], closed: number): Period[] {
  const [statementDay, paymentDay] = days
  const thisMonth = shifted(today, 0, statementDay)
  const current = thisMonth <= today ? thisMonth : shifted(today, -1, statementDay)
  return Array.from({ length: closed + 1 }, (_, index) => {
    const end = addDaysToKey(shifted(current, index - closed + 1, statementDay), -1)
    return { start: shifted(current, index - closed, statementDay), end, due: dueDateAfter(end, paymentDay) }
  })
}

function settle(billed: number, payments: readonly Move[]): Settled {
  if (billed <= PAID_TOLERANCE) return NOT_SETTLED
  let paid = 0
  let fromPaying = false
  for (const move of payments) {
    paid += move.payment
    fromPaying ||= move.fromPaying
    if (paid >= billed - PAID_TOLERANCE) return { paid: Math.min(paid, billed), paidOn: move.day, fromPaying }
  }
  return { paid, paidOn: null, fromPaying }
}

function latestStatus(billed: number, paid: number, due: string, today: string): CardCycleStatus {
  if (billed <= PAID_TOLERANCE) return 'nothing_due'
  if (paid >= billed - PAID_TOLERANCE) return 'paid'
  if (today > due) return 'overdue'
  return paid > 0 ? 'partial' : 'due'
}

function olderStatus(billed: number, paid: number): CardCycleStatus {
  if (billed <= PAID_TOLERANCE) return 'nothing_due'
  return paid >= billed - PAID_TOLERANCE ? 'paid' : 'rolled_over'
}

function cycleOf(period: Period, inside: readonly Move[], billed: number, settled: Settled, status: CardCycleStatus): CardCycle {
  const asks = status === 'due' || status === 'partial' || status === 'overdue'
  return {
    period_start: period.start,
    statement_date: period.end,
    due_date: period.due,
    status,
    spend: round2(total(inside, spendOf)),
    billed: round2(billed),
    paid: round2(settled.paid),
    remaining: asks ? round2(Math.max(0, billed - settled.paid)) : 0,
    paid_on: settled.paidOn,
    paid_from_paying_account: settled.fromPaying,
  }
}

/** The open period and the last `closed` statements of one card, newest first. */
export function demoCycles(
  rows: readonly Move[],
  days: readonly [number, number],
  closed: number,
  today: string,
): { cycles: CardCycle[]; carriedIn: number } {
  const moves = withLifeEventsPaid(rows, today)
  const periods = periodsFor(today, days, closed)
  const within = (period: Period) => moves.filter((m) => m.day >= period.start && m.day <= period.end)
  let owed = total(moves.filter((m) => m.day < periods[0].start), (m) => spendOf(m) - m.payment)
  let carriedIn = 0
  const cycles: CardCycle[] = []
  for (const [index, period] of periods.slice(0, -1).entries()) {
    const inside = within(period)
    const carried = owed - total(inside, paymentOf)
    owed = carried + total(inside, spendOf)
    const billed = Math.max(0, owed)
    const byDue = total(moves.filter((m) => m.day > period.end && m.day <= period.due), paymentOf)
    // Lands after the close, inside the next period, which reads it next.
    if (period.due <= today && byDue < billed - PAID_TOLERANCE) moves.push(payment(period.due, billed - byDue))
    const later = moves.filter((m) => m.payment > 0 && m.day > period.end).sort((a, b) => a.day.localeCompare(b.day))
    const settled = settle(billed, later)
    const isLatest = index === closed - 1
    if (isLatest) carriedIn = round2(Math.min(billed, Math.max(0, carried)))
    const status = isLatest ? latestStatus(billed, settled.paid, period.due, today) : olderStatus(billed, settled.paid)
    cycles.push(cycleOf(period, inside, billed, settled, status))
  }
  const open = periods[closed]
  cycles.push(cycleOf(open, within(open), 0, NOT_SETTLED, 'open'))
  return { cycles: cycles.reverse(), carriedIn }
}
