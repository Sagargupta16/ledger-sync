import type { InvestmentHolding, TransferFlow } from '@/services/api/analyticsV2'
import type { LabelKind, MerchantRow } from '@/pages/merchant-intelligence/types'
import type { Transaction } from '@/types'

import { isExpense, isTransfer } from './demoHelpers'

/** Money-movement demo reads: transfer flows, merchants, investment holdings. */

export function generateDemoTransferFlows(txs: Transaction[]): TransferFlow[] {
  const flows = new Map<string, { total: number; count: number; last: Transaction }>()
  for (const t of txs.filter(isTransfer)) {
    if (!t.from_account || !t.to_account) continue
    const key = `${t.from_account}->${t.to_account}`
    const entry = flows.get(key)
    if (entry) {
      entry.total += t.amount
      entry.count += 1
      if (t.date > entry.last.date) entry.last = t
    } else {
      flows.set(key, { total: t.amount, count: 1, last: t })
    }
  }
  return [...flows.entries()]
    .map(([key, f]) => {
      const [from, to] = key.split('->')
      return {
        from,
        to,
        total: f.total,
        count: f.count,
        avg: f.total / f.count,
        last_date: f.last.date,
        last_amount: f.last.amount,
        from_type: null,
        to_type: null,
      }
    })
    .sort((a, b) => b.total - a.total)
}

/**
 * Mirror of the backend extractor's `label_kind` for a demo merchant label.
 *
 * `extract_merchant()` in `core/analytics/merchant_extract.py` returns
 * `(label, kind)`, and the kind is decided by ONE thing: whether the note was
 * REPLACED by a canonical brand name. A brand match rewrites "Amazon Fashion"
 * to "Amazon"; a miss keeps the whole cleaned note as the descriptor.
 *
 * This generator groups by the raw narration (`t.note`), never by a canonical
 * brand, so its labels are always the note itself -- which is precisely the
 * backend's descriptor case. Returning `'descriptor'` unconditionally is
 * therefore the faithful mirror, not a fallback: claiming `'brand'` for a row
 * labelled "Amazon Fashion" would assert a fold that never happened, and
 * inventing a client-side brand list would be a second, drifting source of
 * truth for a decision the backend already owns.
 */
const DEMO_LABEL_KIND: LabelKind = 'descriptor'

/** A positive integer query param, else the endpoint's default. */
function positiveIntParam(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 ? n : fallback
}

/**
 * Mirrors `get_merchant_intelligence`: highest spend first, filtered by
 * `min_transactions` (default 3) and `recurring_only`, then capped at `limit`
 * (default 50). Both used to be hardcoded (3 and 40), so a caller asking for a
 * top 10, or for one-off merchants, got the demo's fixed page instead.
 */
export function generateDemoMerchantIntelligence(
  txs: Transaction[],
  params: Record<string, unknown> = {},
): MerchantRow[] {
  const minTransactions = positiveIntParam(params.min_transactions, 3)
  const limit = positiveIntParam(params.limit, 50)
  const byMerchant = new Map<string, Transaction[]>()
  for (const t of txs.filter(isExpense)) {
    const merchant = t.note ?? t.subcategory ?? t.category
    if (!byMerchant.has(merchant)) byMerchant.set(merchant, [])
    byMerchant.get(merchant)?.push(t)
  }
  return [...byMerchant.entries()]
    .filter(([, rows]) => rows.length >= minTransactions)
    .map(([merchant, rows]) => {
      // `[...rows].sort` rather than `rows.toSorted`: toSorted needs Firefox
      // 115 but Vite's default `baseline-widely-available` target is
      // firefox114, and the repo ships no core-js polyfill, so the method
      // reaches Firefox 114 users undefined. Spread-then-sort is identical --
      // new array, source untouched, and Array#sort is stable per ES2019.
      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
      const total = rows.reduce((s, t) => s + t.amount, 0)
      const months = new Set(rows.map((t) => t.date.slice(0, 7))).size
      const first = sorted[0].date
      const last = sorted.at(-1)?.date ?? first
      const spanDays =
        (new Date(last).getTime() - new Date(first).getTime()) / 86_400_000
      return {
        merchant,
        label_kind: DEMO_LABEL_KIND,
        category: rows[0].category,
        subcategory: rows[0].subcategory ?? null,
        total_spent: total,
        transaction_count: rows.length,
        avg_transaction: total / rows.length,
        first_transaction: first,
        last_transaction: last,
        months_active: months,
        avg_days_between: rows.length > 1 ? spanDays / (rows.length - 1) : null,
        is_recurring: months >= 6 && rows.length >= 6,
      }
    })
    .filter((row) => params.recurring_only !== true || row.is_recurring)
    .sort((a, b) => b.total_spent - a.total_spent)
    .slice(0, limit)
}

export function generateDemoInvestmentHoldings(txs: Transaction[]): InvestmentHolding[] {
  const investmentAccounts: Record<string, { type: string; growth: number }> = {
    'Groww Mutual Funds': { type: 'mutual_funds', growth: 1.14 },
    'Groww Stocks': { type: 'stocks', growth: 1.11 },
    'PPF Account': { type: 'ppf_epf', growth: 1.071 },
    'EPF Account': { type: 'ppf_epf', growth: 1.0825 },
    'SBI FD': { type: 'fixed_deposits', growth: 1.068 },
  }
  const holdings: InvestmentHolding[] = []
  let id = 1
  for (const [account, meta] of Object.entries(investmentAccounts)) {
    const inflows = txs.filter((t) => isTransfer(t) && t.to_account === account)
    const outflows = txs.filter((t) => isTransfer(t) && t.from_account === account)
    const invested =
      inflows.reduce((s, t) => s + t.amount, 0) - outflows.reduce((s, t) => s + t.amount, 0)
    if (invested <= 0) continue
    // Approximate market value: contributions grew for ~half the horizon on
    // average, at each instrument's indicative annual rate.
    const current = Math.round(invested * Math.pow(meta.growth, 2))
    holdings.push({
      id: id++,
      account,
      investment_type: meta.type,
      instrument_name: null,
      invested_amount: invested,
      current_value: current,
      realized_gains: 0,
      unrealized_gains: current - invested,
      is_active: true,
      last_updated: txs[0]?.date ?? null,
    })
  }
  return holdings
}
