import type {
  KindFilter,
  LabelKind,
  MerchantKindCounts,
  MerchantRow,
  MerchantStats,
} from './types'

/**
 * Labels that carry no payee information.
 *
 * Mirrors `PLACEHOLDER_NOTES` in `backend/src/ledger_sync/core/analytics/
 * merchant_extract.py`, which drops these at rollup-build time. The client
 * filter is not redundant: a rollup built before that guard shipped still has
 * the rows persisted, and on the real ledger "Unknown" was the single largest
 * "merchant" by count. Rebuilding analytics clears them; until then, a stale
 * rollup must not be allowed to headline this page.
 */
const PLACEHOLDER_LABELS: ReadonlySet<string> = new Set([
  'unknown',
  'unknowns',
  'n/a',
  'na',
  'none',
  '-',
  '--',
  '?',
  'misc',
  'miscellaneous',
  'other',
])

/** Default Pareto threshold: the classic "which few make up 80%" question. */
export const PARETO_THRESHOLD = 80

export function isPlaceholderLabel(label: string): boolean {
  return PLACEHOLDER_LABELS.has(label.trim().toLowerCase())
}

/** Narrow the API's free-form `label_kind` string to a known kind. */
export function toLabelKind(raw: string | undefined): LabelKind | null {
  if (raw === 'brand' || raw === 'descriptor') return raw
  return null
}

/**
 * Drop rows that name nothing, plus defensive guards against a malformed
 * rollup (blank label, non-positive spend, zero payments) that would otherwise
 * divide by zero downstream.
 */
export function usableMerchants(rows: readonly MerchantRow[]): MerchantRow[] {
  return rows.filter(
    (row) =>
      row.merchant.trim().length > 0 &&
      !isPlaceholderLabel(row.merchant) &&
      row.total_spent > 0 &&
      row.transaction_count > 0,
  )
}

export function countKinds(rows: readonly MerchantRow[]): MerchantKindCounts {
  let brand = 0
  let descriptor = 0
  let unclassified = 0
  for (const row of rows) {
    const kind = toLabelKind(row.label_kind)
    if (kind === 'brand') brand += 1
    else if (kind === 'descriptor') descriptor += 1
    else unclassified += 1
  }
  return { brand, descriptor, unclassified }
}

/**
 * Apply the label-kind filter as a strict partition.
 *
 * `brand` returns brands, `descriptor` returns descriptors, `unclassified`
 * returns the rows a pre-`label_kind` rollup left untagged. Each row lands in
 * exactly one bucket, so a chip labelled "Brands 0" now yields zero rows.
 *
 * It used to pass unclassified rows through EVERY kind filter, on the reasoning
 * that hiding them would render a pre-`label_kind` rollup as an empty page. That
 * traded one broken-looking screen for a worse one: on the real ledger all 39
 * payees are unclassified, so the page showed "Brands 0" and then listed all 39
 * rows when that chip was pressed -- a filter that reports nothing and filters
 * nothing. The empty-page worry is handled honestly instead: `unclassified` is a
 * visible chip of its own, so those rows are always reachable and always
 * labelled for what they are.
 */
export function filterByKind(rows: readonly MerchantRow[], filter: KindFilter): MerchantRow[] {
  if (filter === 'all') return [...rows]
  if (filter === 'unclassified') return rows.filter((row) => toLabelKind(row.label_kind) === null)
  return rows.filter((row) => toLabelKind(row.label_kind) === filter)
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * How many of the biggest merchants it takes to cross `threshold` percent of
 * tracked spend, plus the share they actually reach.
 *
 * Rows do NOT have to arrive sorted -- the API sorts by `total_spent` desc, but
 * the table lets the user re-sort, so this re-sorts a copy rather than trusting
 * the caller's order.
 */
export function paretoCut(
  rows: readonly MerchantRow[],
  threshold = PARETO_THRESHOLD,
): { count: number; share: number } {
  const total = rows.reduce((sum, row) => sum + row.total_spent, 0)
  if (total <= 0) return { count: 0, share: 0 }
  const descending = [...rows].sort((a, b) => b.total_spent - a.total_spent)
  let running = 0
  for (const [index, row] of descending.entries()) {
    running += row.total_spent
    const share = (running / total) * 100
    if (share >= threshold) return { count: index + 1, share }
  }
  return { count: descending.length, share: 100 }
}

function maxBy(rows: readonly MerchantRow[], value: (row: MerchantRow) => number): MerchantRow | null {
  let best: MerchantRow | null = null
  for (const row of rows) {
    if (best === null || value(row) > value(best)) best = row
  }
  return best
}

/** Headline numbers for the KPI strip. All derived from the filtered rows. */
export function computeStats(
  rows: readonly MerchantRow[],
  threshold = PARETO_THRESHOLD,
): MerchantStats {
  const trackedSpend = rows.reduce((sum, row) => sum + row.total_spent, 0)
  const trackedPayments = rows.reduce((sum, row) => sum + row.transaction_count, 0)
  const topBySpend = maxBy(rows, (row) => row.total_spent)
  const { count: vitalFewCount, share: vitalFewShare } = paretoCut(rows, threshold)
  return {
    merchantCount: rows.length,
    trackedSpend,
    trackedPayments,
    topBySpend,
    topByFrequency: maxBy(rows, (row) => row.transaction_count),
    avgTicket: trackedPayments > 0 ? trackedSpend / trackedPayments : 0,
    medianMerchantTicket: median(rows.map((row) => row.avg_transaction)),
    topShare: trackedSpend > 0 && topBySpend ? (topBySpend.total_spent / trackedSpend) * 100 : 0,
    vitalFewCount,
    vitalFewShare,
  }
}

/**
 * `label -> total_spent` map for `ParetoChart`.
 *
 * Duplicate labels across kinds are possible in principle (an "Apple" brand row
 * and an "Apple" fruit descriptor row are separate buckets server-side), so
 * collisions are summed rather than silently overwritten -- an overwrite would
 * make the chart's cumulative line disagree with the KPI totals.
 */
export function toSpendByLabel(rows: readonly MerchantRow[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const row of rows) {
    totals[row.merchant] = (totals[row.merchant] ?? 0) + row.total_spent
  }
  return totals
}

/**
 * Human cadence from the server's `avg_days_between`, in whichever unit reads
 * naturally. Anything under 2 payments has no gap to average, so it gets
 * "One-off pattern" rather than a fabricated interval.
 */
export function cadenceLabel(row: MerchantRow): string {
  const gap = row.avg_days_between
  if (gap === null || gap <= 0 || row.transaction_count < 2) return 'One-off pattern'
  if (gap <= 2) return 'Almost daily'
  if (gap <= 10) return `Every ~${Math.round(gap)} days`
  if (gap <= 45) return `Every ~${Math.round(gap / 7)} weeks`
  return `Every ~${Math.round(gap / 30)} months`
}
