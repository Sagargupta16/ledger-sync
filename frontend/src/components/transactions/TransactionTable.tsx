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

import type { Transaction } from '@/types'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { getSemanticTextClass } from '@/constants/chartColors'
import EmptyState from '@/components/shared/EmptyState'

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

export default function TransactionTable({ transactions, isLoading, sorting, onSortingChange, availableTags = [] }: Readonly<TransactionTableProps>) {
  const tableMeta: TransactionTableMeta = { availableTags }

  // Wrapper to handle TanStack Table's updater pattern
  const handleSortingChange = useCallback((updaterOrValue: Updater<SortingState>) => {
    if (typeof updaterOrValue === 'function') {
      onSortingChange(updaterOrValue(sorting))
    } else {
      onSortingChange(updaterOrValue)
    }
  }, [onSortingChange, sorting])

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
      <div className="ledger-panel">
        {/* Desktop skeleton */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 border-b border-[var(--hairline-1)] bg-surface-3">
              <tr>
                {Array.from({ length: 7 }, (_, i) => (
                  <th key={`skeleton-header-${i}`} className="px-4 py-2.5 text-left">
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
        <div className="overflow-x-auto">
          <table className="w-full">
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
                        className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground"
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
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-[13px]">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </motion.tbody>
          </table>
        </div>
      </div>

      {/* Mobile card view -- grouped by day with daily totals */}
      <div className="md:hidden">
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

            return (
              <div key={dateKey}>
                {/* Day header */}
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--hairline-1)] bg-surface-3 px-4 py-2">
                  <span className="text-xs font-semibold text-text-tertiary">
                    {formatDate(dateKey, { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' })}
                  </span>
                  <span className={`text-xs font-semibold ${dayTotal >= 0 ? 'text-app-green' : 'text-app-red'}`}>
                    {dayTotal >= 0 ? '+' : ''}{formatCurrency(dayTotal)}
                  </span>
                </div>
                {/* Day transactions */}
                <div className="divide-y divide-[var(--hairline-1)]">
                  {dayRows.map((row) => {
                    const tx = row.original
                    const isIncome = tx.type === 'Income'
                    const isTransfer = tx.type === 'Transfer'
                    const amountColor = getAmountColor(tx.type)
                    const prefix = getAmountPrefix(tx.type)
                    const TypeIcon = isIncome ? TrendingUp : TrendingDown

                    return (
                      <div key={row.id} className="p-3 sm:p-4 hover:bg-[var(--overlay-2)] transition-colors duration-150">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            {isTransfer ? (
                              <ArrowRightLeft className="size-3.5 text-app-teal" />
                            ) : (
                              <TypeIcon className={`w-3.5 h-3.5 ${isIncome ? 'text-app-green' : 'text-app-red'}`} />
                            )}
                            <span className="text-sm font-medium" title={tx.category}>{tx.category}</span>
                            {tx.subcategory && (
                              <span className="text-xs text-text-tertiary" title={tx.subcategory}>/ {tx.subcategory}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className={`text-sm font-semibold ${amountColor}`}>
                              {prefix}{formatCurrency(Math.abs(tx.amount))}
                            </span>
                            <TagEditor transactionId={tx.id} tags={tx.tags ?? []} availableTags={availableTags} />
                          </div>
                        </div>
                        {tx.tags && tx.tags.length > 0 && (
                          <div className="mb-1.5">
                            <TagChips tags={tx.tags} />
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs text-text-tertiary">
                          <span className="text-muted-foreground">{tx.account}</span>
                          {tx.note && (
                            <span className="truncate max-w-[150px]" title={tx.note}>
                              {tx.note}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        })()}
      </div>
    </motion.div>
  )
}
