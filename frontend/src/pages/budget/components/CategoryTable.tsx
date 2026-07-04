import { useMemo, useState } from 'react'

import { ChevronRight, PiggyBank, ShoppingBag, Target } from 'lucide-react'

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

// Cap visible rows per bucket. Rows beyond this get folded into a single
// "Other (N more)" expandable row so the three side-by-side tables stay
// visually balanced on desktop -- otherwise a user with 30 dining categories
// makes the Wants column an ugly scrolling wall next to a tidy 4-row Savings.
const TOP_N = 10

/**
 * Type sentinel: the aggregated "Other" row is rendered inline in the same
 * DataTable, but its `avg_monthly` etc. are computed from the tail sum, and
 * it needs its own row-key + click-to-expand handling.
 */
type CategoryRowWithMeta = SpendingRuleCategoryRow & {
  readonly _isOther?: boolean
  /** Only set on the "Other" row -- the categories rolled into it. */
  readonly _rollup?: readonly SpendingRuleCategoryRow[]
}

function buildBucketRows(
  bucketRows: readonly SpendingRuleCategoryRow[],
  months: number,
): readonly CategoryRowWithMeta[] {
  // Rows come pre-sorted by (bucket, total_amount desc) from the backend.
  // Verify by re-sorting: cheap, and shields us from future backend changes.
  const sorted = [...bucketRows].sort((a, b) => b.total_amount - a.total_amount)

  if (sorted.length <= TOP_N) return sorted

  const top = sorted.slice(0, TOP_N)
  const tail = sorted.slice(TOP_N)
  const tailTotal = tail.reduce((s, r) => s + r.total_amount, 0)
  const tailTxns = tail.reduce((s, r) => s + r.txn_count, 0)
  // months_seen for "Other" is the union across the tail -- cheapest proxy
  // is max, since months_seen on any single row can't exceed the period.
  const tailMonths = Math.max(0, ...tail.map((r) => r.months_seen))

  const other: CategoryRowWithMeta = {
    category: `Other (${tail.length} more)`,
    subcategory: null,
    bucket: sorted[0].bucket,
    total_amount: tailTotal,
    avg_monthly: tailTotal / Math.max(months, 1),
    txn_count: tailTxns,
    months_seen: tailMonths,
    top_subs: [],  // The rolled-up categories become "top_subs" of the Other row conceptually,
    // but rendering handles that separately via _rollup / expand UI.
    _isOther: true,
    _rollup: tail,
  }
  return [...top, other]
}

/**
 * Monthly-average breakdown table, THREE COLUMNS SIDE-BY-SIDE on desktop
 * (Needs | Wants | Savings), stacked on mobile. Each column caps at
 * TOP_N rows and rolls the rest into a click-to-expand "Other" row.
 */
export function CategoryTable({ rows, incomeTotal, months }: Props) {
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
      <div className="glass rounded-2xl border border-border p-8 text-center text-muted-foreground">
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
          incomeTotal={incomeTotal}
        />
      ))}
    </div>
  )
}

interface ColProps {
  readonly bucket: SpendingBucket
  readonly rows: readonly SpendingRuleCategoryRow[]
  readonly months: number
  readonly incomeTotal: number
}

function BucketColumn({ bucket, rows, months, incomeTotal }: ColProps) {
  const meta = BUCKET_META[bucket]
  const Icon = meta.icon
  const [expandedOther, setExpandedOther] = useState(false)

  const visible = useMemo(() => buildBucketRows(rows, months), [rows, months])
  const bucketTotal = rows.reduce((sum, r) => sum + r.total_amount, 0)
  const bucketAvg = bucketTotal / Math.max(months, 1)

  const columns: readonly DataTableColumn<CategoryRowWithMeta>[] = useMemo(
    () => [
      {
        key: 'category',
        header: 'Category',
        sortable: true,
        sortType: 'text',
        sortValue: (row) => row.category.toLowerCase(),
        cell: (row) =>
          row._isOther ? (
            <button
              onClick={() => setExpandedOther((v) => !v)}
              className="flex items-center gap-1.5 text-left group hover:text-foreground"
              aria-expanded={expandedOther}
              aria-label={`${expandedOther ? 'Collapse' : 'Expand'} ${row.category}`}
            >
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform ${
                  expandedOther ? 'rotate-90' : ''
                }`}
                aria-hidden="true"
              />
              <span className="font-medium italic text-muted-foreground group-hover:text-foreground">
                {row.category}
              </span>
            </button>
          ) : (
            <div className="min-w-0">
              <div className="font-medium text-foreground truncate">{row.category}</div>
              {row.top_subs && row.top_subs.length > 0 && (
                <div
                  className="text-[11px] leading-tight text-muted-foreground truncate mt-0.5"
                  title={row.top_subs
                    .map((s) => `${s.name} ${formatCurrency(s.amount)}`)
                    .join('  ·  ')}
                >
                  {row.top_subs
                    .filter((s) => s.name !== '(no subcategory)')
                    .slice(0, 3)
                    .map((s) => s.name)
                    .join(' · ') || null}
                </div>
              )}
            </div>
          ),
        mobilePrimary: true,
      },
      {
        key: 'avg_monthly',
        header: <span className="tabular-nums">Avg / mo</span>,
        align: 'right',
        sortable: true,
        widthClass: 'w-28',
        cell: (row) => (
          <span
            className={`tabular-nums font-medium ${
              row._isOther ? 'text-muted-foreground' : 'text-foreground'
            }`}
          >
            {formatCurrency(row.avg_monthly)}
          </span>
        ),
        mobileLabel: 'Avg / mo',
      },
      {
        key: 'pct_of_income',
        header: <span className="tabular-nums">%</span>,
        align: 'right',
        sortable: true,
        widthClass: 'w-16',
        sortValue: (row) => (incomeTotal > 0 ? row.total_amount / incomeTotal : 0),
        cell: (row) => (
          <span className="tabular-nums text-xs text-muted-foreground">
            {incomeTotal > 0
              ? `${((row.total_amount / incomeTotal) * 100).toFixed(1)}%`
              : '—'}
          </span>
        ),
        mobileLabel: '% income',
      },
    ],
    [incomeTotal, expandedOther],
  )

  return (
    <section
      className="h-full glass rounded-2xl border border-border overflow-hidden flex flex-col"
      aria-label={`${meta.label} category breakdown`}
    >
      {/* Column header */}
      <div className="flex items-baseline justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-4.5 h-4.5 shrink-0 ${meta.tintClass}`} aria-hidden="true" />
          <h3 className="text-sm font-semibold text-foreground">{meta.label}</h3>
          <span className="text-xs text-muted-foreground">
            ({rows.length})
          </span>
        </div>
        <div className="text-xs text-muted-foreground text-right shrink-0">
          <div className="font-medium text-foreground tabular-nums text-sm">
            {formatCurrency(bucketAvg)}
          </div>
          <div className="text-[10px] leading-tight">/ mo avg</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-muted-foreground">
          No categories in {meta.label}.
        </div>
      ) : (
        <>
          <DataTable
            rows={visible as SpendingRuleCategoryRow[]}
            columns={columns as readonly DataTableColumn<SpendingRuleCategoryRow>[]}
            rowKey={(r) => {
              const meta_ = r as CategoryRowWithMeta
              return meta_._isOther
                ? '__other__'
                : `${r.category}::${r.subcategory ?? ''}`
            }}
            initialSort={{ key: 'total_amount', dir: 'desc' }}
            mobileCards
            stickyHeader={false}
          />

          {/* Expanded "Other" rollup contents -- inline list below the table */}
          {expandedOther && rows.length > TOP_N && (
            <div
              className="border-t border-border px-4 py-3 space-y-2"
              aria-label="Other categories detail"
            >
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                Included in Other
              </div>
              {(visible.find((r) => (r as CategoryRowWithMeta)._isOther) as
                | CategoryRowWithMeta
                | undefined)?._rollup?.map((r) => (
                <div
                  key={`${r.category}::${r.subcategory ?? ''}`}
                  className="flex items-baseline justify-between gap-2 text-xs"
                >
                  <span className="truncate text-foreground/80">{r.category}</span>
                  <span className="tabular-nums text-muted-foreground shrink-0">
                    {formatCurrency(r.avg_monthly)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
