import { useCallback } from 'react'

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type Updater,
} from '@tanstack/react-table'
import { ArrowRightLeft, TrendingUp, TrendingDown, Search } from 'lucide-react'
import { motion } from 'framer-motion'

import EmptyState from '@/components/shared/EmptyState'
import { Money } from '@/components/ui'
import { formatCurrency, formatDate } from '@/lib/formatters'
import type { Transaction } from '@/types'
import { getSemanticTextClass } from '@/constants/chartColors'

import TagChips from './TagChips'
import TagEditor from './TagEditor'
import { transactionColumns, type TransactionTableMeta } from './transactionColumns'

interface TransactionTableProps {
  transactions: Transaction[]
  isLoading?: boolean
  sorting: SortingState
  onSortingChange: (sorting: SortingState) => void
  /** Facet tag names, offered as checkable options in the TagEditor popover. */
  availableTags?: string[]
}

function getAmountColor(type: string): string {
  return getSemanticTextClass(type)
}

function getAmountPrefix(type: string): string {
  if (type === 'Transfer') return ''
  if (type === 'Income') return '+'
  return '-'
}

export default function TransactionTable({
  transactions,
  isLoading,
  sorting,
  onSortingChange,
  availableTags = [],
}: Readonly<TransactionTableProps>) {
  const tableMeta: TransactionTableMeta = { availableTags }

  // Wrapper to handle TanStack Table's updater pattern
  const handleSortingChange = useCallback(
    (updaterOrValue: Updater<SortingState>) => {
      if (typeof updaterOrValue === 'function') {
        onSortingChange(updaterOrValue(sorting))
      } else {
        onSortingChange(updaterOrValue)
      }
    },
    [onSortingChange, sorting],
  )

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: transactions,
    columns: transactionColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
    onSortingChange: handleSortingChange,
    manualSorting: true,
    meta: tableMeta,
  })

  if (isLoading) {
    return (
      <div
        className="ledger-panel"
        role="status"
        aria-live="polite"
        aria-label="Loading transactions"
      >
        {/* Desktop skeleton */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full" aria-hidden="true">
            <caption className="sr-only">Loading transactions</caption>
            <thead className="sticky top-0 z-10 border-b border-[var(--hairline-1)] bg-surface-3">
              <tr>
                {Array.from({ length: 7 }, (_, i) => (
                  <th
                    key={`skeleton-header-${i}`}
                    scope="col"
                    className="px-4 py-2.5 text-left"
                  >
                    <div className="h-4 skeleton w-20" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }, (_, i) => (
                <tr key={`skeleton-row-${i}`} className="border-b border-[var(--hairline-1)]">
                  {Array.from({ length: 7 }, (_, j) => (
                    <td key={`skeleton-cell-${i}-${j}`} className="px-4 py-3">
                      <div className="h-4 skeleton w-full" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile skeleton */}
        <div className="md:hidden divide-y divide-[var(--hairline-1)] p-4 space-y-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={`skeleton-card-${i}`} className="p-4 rounded-lg bg-[var(--overlay-2)] border border-border space-y-3">
              <div className="flex justify-between">
                <div className="h-4 skeleton w-24" />
                <div className="h-5 skeleton w-20" />
              </div>
              <div className="h-3 skeleton w-32" />
              <div className="flex justify-between">
                <div className="h-3 skeleton w-16" />
                <div className="h-3 skeleton w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="ledger-panel">
        <EmptyState
          icon={Search}
          title="No transactions found"
          description="Try adjusting your filters or search terms to find what you're looking for."
          variant="default"
        />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="ledger-panel"
    >
      {/* Desktop table */}
      <div className="hidden md:block">
        <div
          className="overflow-x-auto"
          role="region"
          aria-label="Transaction table"
          tabIndex={0}
        >
          <table className="w-full">
            <caption className="sr-only">
              Transactions matching the current filters
            </caption>
            <thead className="sticky top-0 z-10 border-b border-[var(--hairline-1)] bg-surface-3">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const sorted = header.column.getIsSorted()
                    const canSort = header.column.getCanSort()
                    const ariaSort = (() => {
                      if (!canSort) return undefined
                      if (sorted === 'asc') return 'ascending'
                      if (sorted === 'desc') return 'descending'
                      return 'none'
                    })()
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className={`px-4 py-2.5 text-xs font-medium text-muted-foreground ${
                          header.column.id === 'amount'
                            ? 'text-right ledger-figure [&_button]:ml-auto'
                            : 'text-left'
                        }`}
                        aria-sort={ariaSort}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <motion.tbody
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--hairline-1)] hover:bg-[var(--overlay-2)] transition-colors duration-150"
                >
                  {row.getVisibleCells().map((cell) => {
                    const cellClass =
                      cell.column.id === 'amount'
                        ? 'text-right ledger-figure whitespace-nowrap'
                        : cell.column.id === 'date'
                          ? 'whitespace-nowrap'
                          : ''
                    return (
                      <td key={cell.id} className={`px-4 py-3 text-[13px] ${cellClass}`}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </motion.tbody>
          </table>
        </div>
      </div>

      {/* Mobile card view -- grouped by day with daily totals */}
      <div className="md:hidden" role="list" aria-label="Transactions grouped by date">
        {(() => {
          const rows = table.getRowModel().rows
          const grouped = rows.reduce<Record<string, typeof rows>>((acc, row) => {
            const dateKey = row.original.date.substring(0, 10)
            if (!acc[dateKey]) acc[dateKey] = []
            acc[dateKey].push(row)
            return acc
          }, {})

          return Object.entries(grouped).map(([dateKey, dayRows]) => {
            const dayTotal = dayRows.reduce((sum, r) => {
              if (r.original.type === 'Expense') return sum - r.original.amount
              if (r.original.type === 'Income') return sum + r.original.amount
              return sum
            }, 0)
            const dayLabel = formatDate(dateKey, {
              weekday: 'short',
              month: 'short',
              day: '2-digit',
              year: 'numeric',
            })

            return (
              <section key={dateKey} role="listitem" aria-label={dayLabel}>
                {/* Day header */}
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--hairline-1)] bg-surface-3 px-4 py-2">
                  <span className="min-w-0 text-xs font-semibold text-text-tertiary">
                    {dayLabel}
                  </span>
                  <Money
                    value={Math.abs(dayTotal)}
                    formatter={(value) =>
                      `${dayTotal >= 0 ? '+' : '-'}${formatCurrency(value)}`
                    }
                    ariaLabel={`Net total ${formatCurrency(dayTotal)}`}
                    className={`text-xs ${dayTotal >= 0 ? 'text-app-green' : 'text-app-red'}`}
                  />
                </div>
                {/* Day transactions */}
                <div
                  className="divide-y divide-[var(--hairline-1)]"
                  role="list"
                  aria-label={`${dayLabel} transactions`}
                >
                  {dayRows.map((row) => {
                    const tx = row.original
                    const isIncome = tx.type === 'Income'
                    const isTransfer = tx.type === 'Transfer'
                    const amountColor = getAmountColor(tx.type)
                    const prefix = getAmountPrefix(tx.type)
                    const TypeIcon = isIncome ? TrendingUp : TrendingDown

                    return (
                      <div
                        key={row.id}
                        role="listitem"
                        className="p-3 sm:p-4 hover:bg-[var(--overlay-2)] transition-colors duration-150"
                      >
                        <div className="mb-1.5 flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2">
                            {isTransfer ? (
                              <ArrowRightLeft
                                className="mt-0.5 size-3.5 shrink-0 text-app-teal"
                                aria-hidden
                              />
                            ) : (
                              <TypeIcon
                                className={`mt-0.5 size-3.5 shrink-0 ${
                                  isIncome ? 'text-app-green' : 'text-app-red'
                                }`}
                                aria-hidden
                              />
                            )}
                            <span className="min-w-0">
                              <span className="block break-words text-sm font-medium">
                                {tx.category}
                              </span>
                              {tx.subcategory && (
                                <span className="block break-words text-xs text-text-tertiary">
                                  {tx.subcategory}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex min-h-11 shrink-0 items-center gap-1">
                            <Money
                              value={Math.abs(tx.amount)}
                              formatter={(value) => `${prefix}${formatCurrency(value)}`}
                              ariaLabel={`${tx.type} ${formatCurrency(Math.abs(tx.amount))}`}
                              bold
                              className={`text-sm ${amountColor}`}
                            />
                            <TagEditor
                              transactionId={tx.id}
                              tags={tx.tags ?? []}
                              availableTags={availableTags}
                            />
                          </div>
                        </div>
                        {tx.tags && tx.tags.length > 0 && (
                          <div className="mb-1.5">
                            <TagChips tags={tx.tags} />
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-3 text-xs text-text-tertiary">
                          <span className="min-w-0 break-words text-muted-foreground">
                            {tx.account}
                          </span>
                          {tx.note && (
                            <span className="max-w-[55%] break-words text-right">
                              {tx.note}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })
        })()}
      </div>
    </motion.div>
  )
}
