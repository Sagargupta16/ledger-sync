import { useMemo } from 'react'

import { PiggyBank, ShoppingBag, Target } from 'lucide-react'

import { DataTable } from '@/components/ui'
import type { DataTableColumn } from '@/components/ui/DataTable'
import { formatCurrency } from '@/lib/formatters'
import type { SpendingBucket, SpendingRuleCategoryRow } from '@/services/api/analyticsV2'

interface Props {
  readonly rows: readonly SpendingRuleCategoryRow[]
  readonly incomeTotal: number
  readonly months: number
}

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

const BUCKET_ORDER: readonly SpendingBucket[] = ['needs', 'wants', 'savings']

/**
 * Monthly-average breakdown table, grouped by bucket.
 *
 * The rows come pre-classified from the backend. This component just splits
 * them into three sections by bucket and hands each section to a DataTable.
 * Users can sort within a bucket by any column; sorting isn't cross-bucket
 * because that would defeat the "here's your Needs group / Wants group /
 * Savings group" structure the page is built around.
 */
export function CategoryTable({ rows, incomeTotal, months }: Props) {
  const grouped = useMemo(() => {
    const buckets: Record<SpendingBucket, SpendingRuleCategoryRow[]> = {
      needs: [],
      wants: [],
      savings: [],
    }
    for (const row of rows) buckets[row.bucket].push(row)
    return buckets
  }, [rows])

  const columns: readonly DataTableColumn<SpendingRuleCategoryRow>[] = useMemo(
    () => [
      {
        key: 'category',
        header: 'Category',
        sortable: true,
        sortType: 'text',
        sortValue: (row) => row.category.toLowerCase(),
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-medium text-foreground truncate">{row.category}</div>
            {row.subcategory && (
              <div className="text-xs text-muted-foreground truncate">{row.subcategory}</div>
            )}
          </div>
        ),
        mobilePrimary: true,
      },
      {
        key: 'avg_monthly',
        header: <span className="tabular-nums">Avg / month</span>,
        align: 'right',
        sortable: true,
        widthClass: 'w-40',
        cell: (row) => (
          <span className="tabular-nums font-medium text-foreground">
            {formatCurrency(row.avg_monthly)}
          </span>
        ),
        mobileLabel: 'Avg / month',
      },
      {
        key: 'total_amount',
        header: <span className="tabular-nums">Total ({months} mo)</span>,
        align: 'right',
        sortable: true,
        widthClass: 'w-40',
        cell: (row) => (
          <span className="tabular-nums text-muted-foreground">
            {formatCurrency(row.total_amount)}
          </span>
        ),
        mobileLabel: 'Total',
      },
      {
        key: 'pct_of_income',
        header: <span className="tabular-nums">% of income</span>,
        align: 'right',
        sortable: true,
        widthClass: 'w-28',
        sortValue: (row) => (incomeTotal > 0 ? row.total_amount / incomeTotal : 0),
        cell: (row) => (
          <span className="tabular-nums text-muted-foreground">
            {incomeTotal > 0
              ? `${((row.total_amount / incomeTotal) * 100).toFixed(1)}%`
              : '—'}
          </span>
        ),
        mobileLabel: '% income',
      },
      {
        key: 'txn_count',
        header: '#',
        align: 'right',
        sortable: true,
        widthClass: 'w-16',
        cell: (row) => (
          <span className="tabular-nums text-muted-foreground">{row.txn_count}</span>
        ),
        mobileLabel: 'Txns',
      },
    ],
    [months, incomeTotal],
  )

  return (
    <div className="space-y-6">
      {BUCKET_ORDER.map((bucket) => {
        const bucketRows = grouped[bucket]
        if (bucketRows.length === 0) return null

        const meta = BUCKET_META[bucket]
        const Icon = meta.icon
        const bucketTotal = bucketRows.reduce((sum, r) => sum + r.total_amount, 0)
        const bucketAvg = bucketTotal / Math.max(months, 1)

        return (
          <section
            key={bucket}
            className="glass-card rounded-2xl overflow-hidden"
            aria-label={`${meta.label} category breakdown`}
          >
            {/* Section header */}
            <div className="flex items-baseline justify-between gap-4 px-5 py-4 border-b border-[var(--overlay-5)]">
              <div className="flex items-center gap-2">
                <Icon className={`w-5 h-5 ${meta.tintClass}`} aria-hidden="true" />
                <h3 className="text-base font-semibold text-foreground">{meta.label}</h3>
                <span className="text-xs text-muted-foreground">
                  ({bucketRows.length} {bucketRows.length === 1 ? 'category' : 'categories'})
                </span>
              </div>
              <div className="text-sm text-muted-foreground text-right">
                <span className="font-medium text-foreground tabular-nums">
                  {formatCurrency(bucketAvg)}
                </span>
                <span className="text-xs ml-1">/ mo avg</span>
              </div>
            </div>

            <DataTable
              rows={bucketRows}
              columns={columns}
              rowKey={(r) => `${r.category}::${r.subcategory ?? ''}`}
              initialSort={{ key: 'total_amount', dir: 'desc' }}
              mobileCards
              stickyHeader={false}
            />
          </section>
        )
      })}

      {rows.length === 0 && (
        <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground">
          No transactions in this period.
        </div>
      )}
    </div>
  )
}
