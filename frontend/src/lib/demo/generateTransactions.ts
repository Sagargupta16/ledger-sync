import { getTodayKey } from '@/lib/dateUtils'
import type { Transaction } from '@/types'

import { generateMonthlyExpenses } from './demoExpenses'
import { generateMonthlyIncome } from './demoIncome'
import { generateLifeEvents } from './demoLifeEvents'
import { generateCCBillPayments, generateMonthlyTransfers } from './demoTransfers'
import {
  DEMO_MONTHS,
  createRng,
  inflationForMonth,
  salaryForMonth,
  type MonthCtx,
} from './demoTxHelpers'

/**
 * Generate ~2000 realistic Indian tech professional transactions spanning
 * 48 months (four full FYs). The profile follows real-world curves:
 * salary compounds through annual April appraisals (~9.5%, per India
 * salary-increment surveys) plus one promotion; expenses ride a ~4.4%/yr
 * CPI curve (Cost Inflation Index 331->348->363->376); Oct/Nov carry
 * festival-season spikes; and sprinkled life events (trips, gadgets,
 * medical, insurance) give the anomaly/annual views something true to
 * find. Output is deterministic (same data every call).
 */
export function generateDemoTransactions(): Transaction[] {
  const rng = createRng(42)
  const txs: Transaction[] = []

  const todayKey = getTodayKey()
  const [todayYear, todayMonth] = todayKey.split('-').map(Number)
  const startDate = new Date(todayYear, todayMonth - 1 - (DEMO_MONTHS - 1), 1)

  // Month indices (0-based from start) that are Aprils -- hikes land there.
  const aprilIndices: number[] = []
  for (let m = 0; m < DEMO_MONTHS; m++) {
    if ((startDate.getMonth() + m) % 12 === 3) aprilIndices.push(m)
  }

  const ctx: MonthCtx = {
    rng,
    txs,
    idx: 0,
    year: 0,
    month: 0,
    m: 0,
    daysInMonth: 0,
    salaryMonthly: 0,
    inflation: 1,
    festival: false,
  }

  for (let m = 0; m < DEMO_MONTHS; m++) {
    ctx.m = m
    ctx.year = startDate.getFullYear() + Math.floor((startDate.getMonth() + m) / 12)
    ctx.month = (startDate.getMonth() + m) % 12
    ctx.daysInMonth = new Date(ctx.year, ctx.month + 1, 0).getDate()
    ctx.salaryMonthly = salaryForMonth(m, aprilIndices)
    ctx.inflation = inflationForMonth(m)
    ctx.festival = ctx.month === 9 || ctx.month === 10 // Oct/Nov

    const { salary } = generateMonthlyIncome(ctx)
    generateMonthlyExpenses(ctx)
    generateMonthlyTransfers(ctx, salary)
    generateLifeEvents(ctx)
    generateCCBillPayments(ctx, todayKey)
  }

  txs.sort((a, b) => b.date.localeCompare(a.date))

  // The current month is generated whole; what falls after today has not happened yet.
  return txs.filter((t) => t.date <= todayKey)
}
