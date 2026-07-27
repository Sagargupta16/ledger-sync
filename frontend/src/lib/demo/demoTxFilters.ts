import type { Transaction } from '@/types'

/**
 * The transaction filter set shared by every demo route that answers a
 * filtered ledger read -- `/transactions/search` and `/transactions/export`.
 *
 * One implementation rather than one per route: the two endpoints take the same
 * query params from the same page, so a rule that lived in only one of them
 * (an unapplied `category`, a differently-cased `query`) would make the demo
 * export disagree with the demo table it was exported from.
 */
export function filterDemoTransactions(
  txs: Transaction[],
  params: Record<string, unknown>,
): Transaction[] {
  let rows = txs
  const q = typeof params.query === 'string' ? params.query.toLowerCase() : ''
  if (q) {
    rows = rows.filter(
      (t) =>
        t.note?.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.account.toLowerCase().includes(q),
    )
  }
  if (params.category) rows = rows.filter((t) => t.category === params.category)
  if (params.account) rows = rows.filter((t) => t.account === params.account)
  if (params.type) rows = rows.filter((t) => t.type === params.type)
  if (params.tag) rows = rows.filter((t) => (t.tags ?? []).includes(params.tag as string))
  if (params.start_date) rows = rows.filter((t) => t.date >= (params.start_date as string))
  if (params.end_date) rows = rows.filter((t) => t.date <= (params.end_date as string))
  if (params.min_amount != null) rows = rows.filter((t) => t.amount >= Number(params.min_amount))
  if (params.max_amount != null) rows = rows.filter((t) => t.amount <= Number(params.max_amount))
  return rows
}
