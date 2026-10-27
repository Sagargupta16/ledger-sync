/**
 * Credit card due dates as calendar entries from `/api/card-cycles`. Only the
 * latest statement asks for money: unpaid, it shows what is left to pay. Paid
 * statements and the open cycle's spend so far stay on the calendar as
 * informational markers, outside every total. An older statement that rolled
 * into the latest bill, and a statement that billed nothing, are left off.
 */

import { isUnpaid } from '@/components/analytics/cardCyclesSummary'
import { parseLocalDate } from '@/lib/dateUtils'
import type { CardCycle, CardCycleCard, CardCycleStatus } from '@/services/api/cardCycles'

import type { PlacedBill } from './types'

const CARD_BILL_CATEGORY = 'Credit card bill'

/** The line under a card bill's name in the day panel. */
export const CARD_STATUS_NOTE: Record<CardCycleStatus, string> = {
  open: 'Spend so far; the statement has not closed',
  nothing_due: 'Nothing billed',
  paid: 'Statement paid',
  partial: 'Left to pay after a part payment',
  due: 'Statement amount',
  overdue: 'Unpaid after the due date',
  rolled_over: 'Carried into the next statement',
}

type CalendarEntry = Required<Pick<PlacedBill, 'amount' | 'informational'>>

/** What one cycle puts on its due date, or null for nothing. */
function calendarEntry(cycle: CardCycle, isLatest: boolean): CalendarEntry | null {
  if (cycle.status === 'open') return { amount: Math.max(0, cycle.spend), informational: true }
  if (cycle.status === 'paid') return { amount: cycle.billed, informational: true }
  if (isLatest && isUnpaid(cycle.status)) return { amount: cycle.remaining, informational: false }
  return null
}

/** Each card's due dates in one month (0-indexed, like `Date`), keyed by day. */
export function buildCardBillMap(
  cards: readonly CardCycleCard[],
  year: number,
  month: number,
): Map<number, PlacedBill[]> {
  const map = new Map<number, PlacedBill[]>()
  for (const card of cards) {
    // cycles[0] is the open period and cycles[1] the latest statement.
    for (const [index, cycle] of card.cycles.entries()) {
      const due = parseLocalDate(cycle.due_date)
      if (due.getFullYear() !== year || due.getMonth() !== month) continue
      const entry = calendarEntry(cycle, index === 1)
      if (!entry || entry.amount <= 0) continue
      const day = due.getDate()
      map.set(day, [
        ...(map.get(day) ?? []),
        {
          key: `card-${card.account_id}-${cycle.statement_date}`,
          name: card.name,
          ...entry,
          category: CARD_BILL_CATEGORY,
          frequency: 'monthly',
          type: 'Expense',
          day,
          source: 'card',
          cardStatus: cycle.status,
        },
      ])
    }
  }
  return map
}

/** `extra` after `bills` on each day: recurring bills, then card dues, then tax dates. */
export function appendBills(
  bills: Map<number, PlacedBill[]>,
  extra: Map<number, PlacedBill[]>,
): Map<number, PlacedBill[]> {
  if (extra.size === 0) return bills
  const merged = new Map(bills)
  for (const [day, dues] of extra) merged.set(day, [...(merged.get(day) ?? []), ...dues])
  return merged
}
