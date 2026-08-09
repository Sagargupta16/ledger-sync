import { motion } from 'motion/react'

import EmptyState from '@/components/shared/EmptyState'
import { DataTable, Money, type DataTableColumn } from '@/components/ui'
import { ROUTES } from '@/constants'
import { formatDate, formatPercent } from '@/lib/formatters'

import { cadenceLabel, toLabelKind } from '../merchantUtils'
import type { MerchantRow } from '../types'

interface MerchantTableProps {
  readonly rows: readonly MerchantRow[]
  readonly trackedSpend: number
  /** Shown when the filters emptied the table rather than the data being empty. */
  readonly isFilteredEmpty: boolean
  readonly onClearFilters: () => void
}

/**
 * Brand vs note badge.
 *
 * A descriptor row is the transaction note, so it answers "what did I buy",
 * not "who did I pay". Saying that inline is the difference between a useful
 * table and one that invents merchants named "Juice - Pineapple".
 */
function KindBadge({ kind }: { readonly kind: string | undefined }) {
  const resolved = toLabelKind(kind)
  if (resolved === 'brand') {
    return (
      <span
        className="shrink-0 rounded-full bg-app-blue/15 px-1.5 py-0.5 text-[10px] font-medium text-app-blue"
        title="Recognised payee name"
      >
        brand
      </span>
    )
  }
  if (resolved === 'descriptor') {
    return (
      <span
        className="shrink-0 rounded-full bg-[var(--overlay-4)] px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary"
        title="Raw transaction note, not a confirmed payee. This is what was bought."
      >
        note
      </span>
    )
  }
  return (
    <span
      className="shrink-0 rounded-full bg-[var(--overlay-3)] px-1.5 py-0.5 text-[10px] font-medium text-text-quaternary"
      title="This rollup predates payee classification. Re-run an upload to classify it."
    >
      unclassified
    </span>
  )
}

function buildColumns(trackedSpend: number): DataTableColumn<MerchantRow>[] {
  return [
    {
      key: 'merchant',
      header: 'Payee',
      sortable: true,
      sortType: 'text',
      mobilePrimary: true,
      cell: (row) => (
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="font-medium text-foreground sm:truncate" title={row.merchant}>
              {row.merchant}
            </span>
            <KindBadge kind={row.label_kind} />
          </div>
          <p className="text-[11px] text-text-tertiary sm:truncate">
            {row.category}
            {row.subcategory ? ` / ${row.subcategory}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'total_spent',
      header: 'Total',
      align: 'right',
      sortable: true,
      mobileLabel: 'Total',
      // Money, not a bare string: at 3-column widths a <td> truncates digits.
      cell: (row) => <Money value={row.total_spent} bold />,
    },
    {
      key: 'share',
      header: 'Share',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.total_spent,
      mobileLabel: 'Share of tracked spend',
      cell: (row) => (
        <span className="tabular-nums text-text-secondary">
          {trackedSpend > 0 ? formatPercent((row.total_spent / trackedSpend) * 100) : '--'}
        </span>
      ),
    },
    {
      key: 'transaction_count',
      header: 'Payments',
      align: 'right',
      sortable: true,
      mobileLabel: 'Payments',
      cell: (row) => <span className="tabular-nums text-foreground">{row.transaction_count}</span>,
    },
    {
      key: 'avg_transaction',
      header: 'Avg',
      align: 'right',
      sortable: true,
      mobileLabel: 'Average payment',
      cell: (row) => <Money value={row.avg_transaction} muted />,
    },
    {
      key: 'cadence',
      header: 'Cadence',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.avg_days_between ?? Number.MAX_SAFE_INTEGER,
      mobileLabel: 'Cadence',
      cell: (row) => (
        <span className="whitespace-nowrap text-[11px] text-text-secondary">
          {cadenceLabel(row)}
          {row.is_recurring && <span className="ml-1 text-app-teal">recurring</span>}
        </span>
      ),
    },
    {
      key: 'last_transaction',
      header: 'Last paid',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.last_transaction ?? '',
      mobileLabel: 'Last paid',
      cell: (row) => (
        <span className="whitespace-nowrap text-[11px] text-text-tertiary">
          {row.last_transaction ? formatDate(row.last_transaction) : '--'}
        </span>
      ),
    },
  ]
}

/**
 * The full payee ledger: sortable, mobile-card-friendly, and explicit about
 * which rows are real brands versus raw notes.
 */
export default function MerchantTable({
  rows,
  trackedSpend,
  isFilteredEmpty,
  onClearFilters,
}: MerchantTableProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Every payee</h2>
        <p className="text-xs text-text-tertiary">
          Sort any column. Rows tagged &quot;note&quot; describe what was bought, not who was paid.
        </p>
      </div>
      <DataTable<MerchantRow>
        columns={buildColumns(trackedSpend)}
        rows={rows}
        rowKey={(row) => `${row.merchant}-${row.label_kind ?? 'unclassified'}`}
        initialSort={{ key: 'total_spent', dir: 'desc' }}
        ariaLabel="Payees by total spend, payment count, average payment and cadence"
        animateRows
        mobileCards
        stickyHeader
        maxHeightClass="max-h-[36rem]"
        emptyState={
          isFilteredEmpty ? (
            <EmptyState
              title="No payees match these filters"
              description="Clear the filters to see the full payee list."
              actionLabel="Clear filters"
              onAction={onClearFilters}
              variant="card"
            />
          ) : (
            <EmptyState
              title="No payees yet"
              description="Payees come from transaction notes. Upload statements that keep the narration column."
              actionHref={ROUTES.UPLOAD}
              actionLabel="Upload statements"
              variant="card"
            />
          )
        }
      />
    </motion.div>
  )
}
