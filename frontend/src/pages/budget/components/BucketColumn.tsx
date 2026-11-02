import { useMemo, useState } from 'react'

import { PiggyBank, ShoppingBag, Target } from 'lucide-react'

import { Money } from '@/components/ui'
import { formatCurrency } from '@/lib/formatters'
import type { SpendingBucket, SpendingRuleCategoryRow } from '@/services/api/analyticsV2'

import { CategoryRow, type CategoryRowWithMeta } from './CategoryRow'

const BUCKET_META: Record<
  SpendingBucket,
  {
    readonly label: string
    readonly icon: typeof Target
    readonly tintClass: string
  }
> = {
  needs: { label: 'Needs', icon: Target, tintClass: 'text-app-blue' },
  wants: { label: 'Wants', icon: ShoppingBag, tintClass: 'text-app-orange' },
  savings: { label: 'Savings', icon: PiggyBank, tintClass: 'text-app-green' },
}

/** Cap visible rows per bucket -- rows 11+ collapse into "Other (N more)". */
const TOP_N = 10

/**
 * `avg_monthly` is each row's COMPLETE-month total over the period's complete
 * months (the in-progress month is excluded, empty months count as 0), while
 * `total_amount` still includes the partial month. So the rollup's average is
 * the sum of its rows' averages, never a total divided by the month count.
 */
function buildBucketRows(
  bucketRows: readonly SpendingRuleCategoryRow[],
): readonly CategoryRowWithMeta[] {
  const sorted = [...bucketRows].sort((a, b) => b.total_amount - a.total_amount)
  if (sorted.length <= TOP_N) return sorted

  const top = sorted.slice(0, TOP_N)
  const tail = sorted.slice(TOP_N)
  const tailTotal = tail.reduce((s, r) => s + r.total_amount, 0)
  const tailAvg = tail.reduce((s, r) => s + r.avg_monthly, 0)
  const tailTxns = tail.reduce((s, r) => s + r.txn_count, 0)
  const tailMonths = Math.max(0, ...tail.map((r) => r.months_seen))

  return [
    ...top,
    {
      category: `Other (${tail.length} more)`,
      subcategory: null,
      bucket: sorted[0].bucket,
      total_amount: tailTotal,
      avg_monthly: tailAvg,
      txn_count: tailTxns,
      months_seen: tailMonths,
      top_subs: [],
      _isOther: true,
      _rollup: tail,
    },
  ]
}

interface ColProps {
  readonly bucket: SpendingBucket
  readonly rows: readonly SpendingRuleCategoryRow[]
  readonly months: number
}

export function BucketColumn({ bucket, rows, months }: ColProps) {
  const meta = BUCKET_META[bucket]
  const Icon = meta.icon
  const [expandedOther, setExpandedOther] = useState(false)

  const visible = useMemo(() => buildBucketRows(rows), [rows])
  const rollupRow = useMemo(
    () => visible.find((row) => row._isOther),
    [visible],
  )
  // Same basis as the row averages (complete months only); see buildBucketRows.
  const bucketAvg = rows.reduce((sum, r) => sum + r.avg_monthly, 0)

  return (
    <section
      className="ledger-panel flex h-full flex-col overflow-hidden"
      aria-label={`${meta.label} category breakdown`}
    >
      {/* Column header: bucket label + count on left, monthly avg on right */}
      <div className="flex items-baseline justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 ${meta.tintClass}`} aria-hidden="true" />
          <h3 className="text-sm font-semibold text-foreground">{meta.label}</h3>
          <span className="text-xs text-muted-foreground">({rows.length})</span>
        </div>
        <div className="text-right shrink-0">
          <Money value={bucketAvg} bold className="text-sm" />
          <div className="text-[10px] leading-tight text-muted-foreground">
            {months === 0 ? 'no complete month yet' : '/ mo avg'}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-muted-foreground">
          No categories in {meta.label}.
        </div>
      ) : (
        <div className="p-2 flex flex-col gap-0.5">
          {visible.map((row) => {
            const key = row._isOther ? '__other__' : `${row.category}::${row.subcategory ?? ''}`
            return (
              <CategoryRow
                key={key}
                row={row}
                isOther={!!row._isOther}
                expanded={expandedOther}
                onToggle={row._isOther ? () => setExpandedOther((v) => !v) : undefined}
              />
            )
          })}

          {/* "Other" expanded contents: full list of rolled-up categories */}
          {expandedOther && rollupRow?._rollup && (
            <div className="mt-1 ml-6 pl-3 border-l border-[var(--hairline-2)] space-y-1">
              {rollupRow._rollup.map((r) => (
                <div
                  key={`${r.category}::${r.subcategory ?? ''}`}
                  className="flex items-baseline gap-2"
                >
                  <span className="min-w-0 flex-1 break-words text-xs text-foreground/70">
                    {r.category}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {formatCurrency(r.avg_monthly)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
