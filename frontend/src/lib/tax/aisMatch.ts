/**
 * How one AIS income line finds its ledger credit. A single row matches when
 * its amount equals the line's gross, or its gross less TDS, within 1% (at
 * least Rs 1) and its date is within 10 days when the line has one. An annual
 * interest or dividend figure instead matches one account's rows whose sum
 * agrees within 2% (at least Rs 10): quarterly credits against an annual SFT
 * figure. A computation aid, not tax advice.
 */

import { payerKey } from './aisSummary'
import type { AisLine, ReconLedgerRow } from './aisTypes'

const ROW_WINDOW_DAYS = 10
const GROUP_LOOKBACK_DAYS = 120
const DAY_MS = 86_400_000

const dayOf = (date: string) => Date.parse(date.slice(0, 10))
export const daysApart = (a: string, b: string) => Math.abs(dayOf(a) - dayOf(b)) / DAY_MS

const within = (amount: number, target: number, share: number, floor: number) =>
  target > 0 && Math.abs(amount - target) <= Math.max(floor, target * share)

/**
 * Amounts a ledger credit for the line may show: the gross, and the gross less
 * its TDS. An SFT interest or dividend line carries no tax column, so it also
 * accepts the gross less 10%, the section 194/194A rate its payer deducts.
 */
function targetsOf(line: AisLine): number[] {
  if (line.tax !== null) return [line.amount, line.amount - line.tax]
  const banded = line.head === 'interest' || line.head === 'dividend'
  return banded ? [line.amount, line.amount * 0.9] : [line.amount]
}

/** The closest single ledger row for a line, or null. */
export function bestRow(line: AisLine, pool: readonly ReconLedgerRow[]): ReconLedgerRow | null {
  const targets = targetsOf(line)
  let best: ReconLedgerRow | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const row of pool) {
    // Every target list starts with the line's own amount, so it seeds the pick.
    const target = targets.reduce(
      (a, b) => (Math.abs(row.amount - a) <= Math.abs(row.amount - b) ? a : b),
      line.amount,
    )
    if (!within(row.amount, target, 0.01, 1)) continue
    const days = line.date ? daysApart(row.date, line.date) : 0
    if (days > ROW_WINDOW_DAYS) continue
    const score = Math.abs(row.amount - target) / target + days / 1000
    if (score < bestScore) {
      best = row
      bestScore = score
    }
  }
  return best
}

/** One account's rows (those naming the payer first) whose sum agrees with the line. */
export function matchingGroup(line: AisLine, pool: readonly ReconLedgerRow[]): ReconLedgerRow[] | null {
  const end = line.date ? dayOf(line.date) + ROW_WINDOW_DAYS * DAY_MS : Number.POSITIVE_INFINITY
  const start = line.date ? dayOf(line.date) - GROUP_LOOKBACK_DAYS * DAY_MS : Number.NEGATIVE_INFINITY
  const byAccount = new Map<string, ReconLedgerRow[]>()
  for (const row of pool) {
    const day = dayOf(row.date)
    if (day < start || day > end) continue
    byAccount.set(row.account, [...(byAccount.get(row.account) ?? []), row])
  }
  const tokens = payerKey(line.source).split(' ').filter((token) => token.length >= 3 && token !== 'BANK')
  const names = (account: string) => tokens.some((token) => account.toUpperCase().includes(token))
  const groups = [...byAccount.entries()].sort(([a], [b]) => Number(names(b)) - Number(names(a)))
  const targets = targetsOf(line)
  for (const [, rows] of groups) {
    // One row is a single credit, which `bestRow` already tried within its window.
    if (rows.length < 2) continue
    const sum = rows.reduce((total, row) => total + row.amount, 0)
    if (targets.some((target) => within(sum, target, 0.02, 10))) return rows
  }
  return null
}
