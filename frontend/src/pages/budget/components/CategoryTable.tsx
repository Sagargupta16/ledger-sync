import { useMemo } from 'react'

import type { SpendingBucket, SpendingRuleCategoryRow } from '@/services/api/analyticsV2'

import { BucketColumn } from './BucketColumn'

interface Props {
  readonly rows: readonly SpendingRuleCategoryRow[]
  readonly months: number
}

const BUCKET_ORDER: readonly SpendingBucket[] = ['needs', 'wants', 'savings']

/**
 * Three-column Needs / Wants / Savings breakdown.
 *
 * ## Layout: hand-rolled flex rows, NOT DataTable
 *
 * Three DataTables inside a `lg:grid-cols-3` grid each get ~33% of viewport.
 * DataTable has no `whitespace-nowrap` on `<td>` and no `table-layout: fixed`,
 * so at 33% width the amount digits truncate ("₹12,91" instead of "₹12,913.24").
 * The app's `CategoryBreakdown.tsx` + `TopMerchants.tsx` solve this exact
 * problem with a hand-rolled `flex items-center gap-2` row:
 *   - `flex-1 min-w-0` on the name+subcategory block (truncates cleanly)
 *   - `shrink-0 w-24 text-right tabular-nums whitespace-nowrap` on the amount
 *     (never truncates, always right-aligned)
 * That's the canonical pattern here. Rows are already sorted by amount desc
 * from the backend so no sort-header UI is needed.
 */
export function CategoryTable({ rows, months }: Props) {
  const bucketData = useMemo(() => {
    const buckets: Record<SpendingBucket, SpendingRuleCategoryRow[]> = {
      needs: [],
      wants: [],
      savings: [],
    }
    for (const row of rows) buckets[row.bucket].push(row)
    return buckets
  }, [rows])

  if (rows.length === 0) {
    return (
      <div className="ledger-panel p-8 text-center text-muted-foreground">
        No transactions in this period.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {BUCKET_ORDER.map((bucket) => (
        <BucketColumn
          key={bucket}
          bucket={bucket}
          rows={bucketData[bucket]}
          months={months}
        />
      ))}
    </div>
  )
}
