import type { Transaction } from '@/types'

import { generateMonthlyExpenses } from './demoExpenses'
import { generateMonthlyIncome } from './demoIncome'
import { generateMonthlyTransfers } from './demoTransfers'
import { createRng, type MonthCtx } from './demoTxHelpers'

/**
 * Generate ~1000 realistic Indian tech professional transactions spanning 24 months.
 * Output is deterministic (same data every call).
 */
export function generateDemoTransactions(): Transaction[] {
  const rng = createRng(42)
  const txs: Transaction[] = []

  const now = new Date()
  const startDate = new Date(now.getFullYear(), now.getMonth() - 23, 1)

  const ctx: MonthCtx = { rng, txs, idx: 0, year: 0, month: 0, m: 0, daysInMonth: 0 }

  for (let m = 0; m < 24; m++) {
    ctx.m = m
    ctx.year = startDate.getFullYear() + Math.floor((startDate.getMonth() + m) / 12)
    ctx.month = (startDate.getMonth() + m) % 12
    ctx.daysInMonth = new Date(ctx.year, ctx.month + 1, 0).getDate()

    const { salary } = generateMonthlyIncome(ctx)
    generateMonthlyExpenses(ctx)
    generateMonthlyTransfers(ctx, salary)
  }

  txs.sort((a, b) => b.date.localeCompare(a.date))

  return txs
}
