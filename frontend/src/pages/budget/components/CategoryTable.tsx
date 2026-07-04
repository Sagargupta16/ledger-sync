import { useMemo, useState } from 'react'

import { ChevronRight, PiggyBank, ShoppingBag, Target } from 'lucide-react'

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

/** Cap visible rows per bucket -- rows 11+ collapse into "Other (N more)". */
const TOP_N = 10

type CategoryRowWithMeta = SpendingRuleCategoryRow & {
  readonly _isOther?: boolean
  readonly _rollup?: readonly SpendingRuleCategoryRow[]
}

function buildBucketRows(
  bucketRows: readonly SpendingRuleCategoryRow[],
  months: number,
): readonly CategoryRowWithMeta[] {
  const sorted = [...bucketRows].sort((a, b) => b.total_amount - a.total_amount)
  if (sorted.length <= TOP_N) return sorted

  const top = sorted.slice(0, TOP_N)
  const tail = sorted.slice(TOP_N)
  const tailTotal = tail.reduce((s, r) => s + r.total_amount, 0)
  const tailTxns = tail.reduce((s, r) => s + r.txn_count, 0)
  const tailMonths = Math.max(0, ...tail.map((r) => r.months_seen))

  return [
    ...top,
    {
      category: `Other (${tail.length} more)`,
      subcategory: null,
      bucket: sorted[0].bucket,
      total_amount: tailTotal,
      avg_monthly: tailTotal / Math.max(months, 1),
      txn_count: tailTxns,
      months_seen: tailMonths,
      top_subs: [],
      _isOther: true,
      _rollup: tail,
    },
  ]
}

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

  // `incomeTotal` used to drive a % column that was dropped -- YNAB / Monarch /
  // Copilot all render category rows without % of income; the bucket header
  // cards already show the ratio. Keeping the prop on this component to
  // preserve the call-site contract.
  void incomeTotal

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

interface ColProps {
  readonly bucket: SpendingBucket
  readonly rows: readonly SpendingRuleCategoryRow[]
  readonly months: number
}

function BucketColumn({ bucket, rows, months }: ColProps) {
  const meta = BUCKET_META[bucket]
  const Icon = meta.icon
  const [expandedOther, setExpandedOther] = useState(false)

  const visible = useMemo(() => buildBucketRows(rows, months), [rows, months])
  const rollupRow = useMemo(
    () => visible.find((r) => (r as CategoryRowWithMeta)._isOther) as CategoryRowWithMeta | undefined,
    [visible],
  )
  const bucketTotal = rows.reduce((sum, r) => sum + r.total_amount, 0)
  const bucketAvg = bucketTotal / Math.max(months, 1)

  return (
    <section
      className="h-full glass rounded-2xl border border-border overflow-hidden flex flex-col"
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
          <div className="text-sm font-semibold text-foreground tabular-nums whitespace-nowrap">
            {formatCurrency(bucketAvg)}
          </div>
          <div className="text-[10px] leading-tight text-muted-foreground">/ mo avg</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-muted-foreground">
          No categories in {meta.label}.
        </div>
      ) : (
        <div className="p-2 flex flex-col gap-0.5">
          {visible.map((row) => {
            const rowMeta = row as CategoryRowWithMeta
            const key = rowMeta._isOther ? '__other__' : `${row.category}::${row.subcategory ?? ''}`
            return (
              <CategoryRow
                key={key}
                row={rowMeta}
                isOther={!!rowMeta._isOther}
                expanded={expandedOther}
                onToggle={rowMeta._isOther ? () => setExpandedOther((v) => !v) : undefined}
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
                  <span className="flex-1 min-w-0 text-xs text-foreground/70 truncate">
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

interface RowProps {
  readonly row: CategoryRowWithMeta
  readonly isOther: boolean
  readonly expanded: boolean
  readonly onToggle?: () => void
}

/**
 * One category row: name + (up to 3) subcategory hints on the left,
 * monthly-average amount right-aligned. Amount NEVER truncates.
 *
 * Layout follows `CategoryBreakdown.tsx:167-201` -- flex row with flex-1/min-w-0
 * name block and shrink-0/text-right amount. The subcategory line is a second
 * <div> inside the flex-1 block, so truncation happens on both name and subs
 * without ever compressing the amount cell.
 */
function CategoryRow({ row, isOther, expanded, onToggle }: RowProps) {
  const subLine =
    !isOther && row.top_subs && row.top_subs.length > 0
      ? row.top_subs
          .filter((s) => s.name !== '(no subcategory)')
          .slice(0, 3)
          .map((s) => s.name)
          .join(' · ')
      : null

  const inner = (
    <div className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-[var(--overlay-2)] transition-colors">
      {isOther && (
        <ChevronRight
          className={`w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform ${
            expanded ? 'rotate-90' : ''
          }`}
          aria-hidden="true"
        />
      )}

      <div className="flex-1 min-w-0">
        <div
          className={`text-sm font-medium truncate ${
            isOther ? 'italic text-muted-foreground' : 'text-foreground'
          }`}
        >
          {row.category}
        </div>
        {subLine && (
          <div
            className="text-[11px] leading-tight text-muted-foreground truncate mt-0.5"
            title={row.top_subs
              .map((s) => `${s.name} ${formatCurrency(s.amount)}`)
              .join('  ·  ')}
          >
            {subLine}
          </div>
        )}
      </div>

      {/* Amount: fixed width, whitespace-nowrap, tabular-nums, right-aligned.
          THIS is the single most important line -- never truncates the number. */}
      <span
        className={`shrink-0 w-24 text-right text-sm font-medium tabular-nums whitespace-nowrap ${
          isOther ? 'text-muted-foreground' : 'text-foreground'
        }`}
      >
        {formatCurrency(row.avg_monthly)}
      </span>
    </div>
  )

  if (isOther && onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${row.category}`}
        className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-app-blue/50 rounded-lg"
      >
        {inner}
      </button>
    )
  }

  return inner
}
