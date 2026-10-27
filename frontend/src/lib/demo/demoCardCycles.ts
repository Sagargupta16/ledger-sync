import { getTodayKey } from '@/lib/dateUtils'
import type { CardCycle, CardCycleCard, CardCyclesResponse } from '@/services/api/cardCycles'
import type { Transaction } from '@/types'

import { daysBetween, demoCycles, movesFor, round2 } from './demoCardCycleModel'
import { generateDemoAccountBalances } from './demoCalculations'
import { ACCOUNTS } from './demoTemplates'

/**
 * Demo `GET /api/card-cycles`: the backend statement rules over the demo
 * ledger, for a user who pays every bill (see `demoCardCycleModel`). The demo
 * cards get made-up Money Manager card days (statement day, payment day), and
 * all of them are paid from the salary account, where the demo's card bill
 * payments come from.
 */
const DEMO_CARDS = [
  { id: 101, name: ACCOUNTS.amazonCC, days: [18, 5] },
  { id: 102, name: ACCOUNTS.axisCC, days: [11, 28] },
  { id: 103, name: ACCOUNTS.swiggyCC, days: [25, 12] },
] as const
type DemoCard = (typeof DEMO_CARDS)[number]
const PAYING = { id: 201, name: ACCOUNTS.hdfc } as const
const DEFAULT_HISTORY = 6

function toCard(card: DemoCard, cycles: CardCycle[], carriedIn: number, today: string): CardCycleCard {
  const [current, latest] = cycles
  return {
    account_id: card.id,
    name: card.name,
    statement_day: card.days[0],
    payment_day: card.days[1],
    paying_account_id: PAYING.id,
    paying_account: PAYING.name,
    last_statement_date: latest.statement_date,
    next_statement_date: current.statement_date,
    due_date: latest.due_date,
    days_to_due: daysBetween(today, latest.due_date),
    billed_amount: latest.billed,
    paid_amount: latest.paid,
    due_amount: latest.remaining,
    carried_in: carriedIn,
    status: latest.status,
    paid_on: latest.paid_on,
    paid_from_paying_account: latest.paid_from_paying_account,
    unbilled_amount: Math.max(0, current.spend),
    next_due_date: current.due_date,
    days_to_next_due: daysBetween(today, current.due_date),
    cycles,
  }
}

export function generateDemoCardCycles(
  txs: Transaction[],
  params: Record<string, unknown> = {},
): CardCyclesResponse {
  const today = getTodayKey()
  const requested = Math.trunc(Number(params.history ?? DEFAULT_HISTORY))
  const history = Number.isFinite(requested) ? Math.min(24, Math.max(1, requested)) : DEFAULT_HISTORY
  const cards = DEMO_CARDS.map((card) => {
    const moves = movesFor(txs, card.name, PAYING.name, today)
    const { cycles, carriedIn } = demoCycles(moves, card.days, history, today)
    return toCard(card, cycles, carriedIn, today)
  })
  const balances = generateDemoAccountBalances(txs, { end_date: today }).accounts
  const balance = balances[PAYING.name]?.balance ?? 0
  const dues = round2(cards.reduce((sum, card) => sum + card.due_amount, 0))
  return {
    as_of: today,
    cards,
    paying_accounts: [
      {
        account_id: PAYING.id,
        name: PAYING.name,
        balance: round2(balance),
        upcoming_dues: dues,
        unbilled: round2(cards.reduce((sum, card) => sum + card.unbilled_amount, 0)),
        cash_after_dues: round2(balance - dues),
        cards: cards.map((card) => card.name),
      },
    ],
    skipped: [],
  }
}
