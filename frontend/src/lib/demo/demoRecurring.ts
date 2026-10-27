/**
 * Demo answer for `GET /api/analytics/v2/recurring-transactions`.
 *
 * The rows from `generateDemoRecurring`, filtered the way the handler filters
 * (`active_only`, `pattern_kind`), with the amount state every row carries:
 * `detected_amount` and `amount_edited`. One bill has an amount the user set
 * over the detected one, so the Edited state and its Reset show in the demo.
 */

import type { RecurringTransaction } from '@/services/api/analyticsV2'
import type { Transaction } from '@/types'

import { generateDemoRecurring } from './demoAnalyticsV2'

/** A plan price rise the detector has not caught up with yet. */
const EDITED_DEMO_BILL = { name: 'Mobile Recharge', amount: 399 }

function withAmountState(row: RecurringTransaction): RecurringTransaction {
  const edited = row.name === EDITED_DEMO_BILL.name
  return {
    ...row,
    expected_amount: edited ? EDITED_DEMO_BILL.amount : row.expected_amount,
    detected_amount: row.expected_amount,
    amount_edited: edited,
  }
}

export function resolveDemoRecurring(
  _txs: Transaction[],
  params: Record<string, unknown>,
): { data: RecurringTransaction[]; count: number } {
  let rows = generateDemoRecurring().map(withAmountState)
  if (params.active_only) rows = rows.filter((row) => row.is_active)
  if (params.pattern_kind) rows = rows.filter((row) => row.pattern_kind === params.pattern_kind)
  return { data: rows, count: rows.length }
}
