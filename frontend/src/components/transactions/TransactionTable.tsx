import { useCallback } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type Updater,
} from '@tanstack/react-table'
import { ArrowUpDown, TrendingUp, TrendingDown, Search } from 'lucide-react'
import type { Transaction } from '@/types'
import { format } from 'date-fns'
import { formatCurrency } from '@/lib/formatters'
import { motion } from 'framer-motion'
import EmptyState from '@/components/shared/EmptyState'

interface TransactionTableProps {
  transactions: Transaction[]
  isLoading?: boolean
  sorting: SortingState
  onSortingChange: (sorting: SortingState) => void
}

const columns: ColumnDef<Transaction>[] = [
  {
    accessorKey: 'date',
    header: ({ column }) => (
      <button
        onClick={() => column.toggleSorting()}
        className="flex items-center gap-2 hover:text-primary transition-colors"
      >
        Date
        <ArrowUpDown className="w-4 h-4" />
      </button>
    ),
    cell: ({ row }) => (
      <span className="text-sm">{format(new Date(row.original.date), 'MMM dd, yyyy')}</span>
    ),
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => {
      const type = row.original.type
      const typeIcon = (() => {
        if (type === 'Income') return <TrendingUp className="w-4 h-4 text-ios-green" />
        if (type === 'Transfer') return <span className="text-ios-blue">→</span>
        return <TrendingDown className="w-4 h-4 text-ios-red" />
      })()
      return (
        <div className="flex items-center gap-2">
          {typeIcon}
          <span className="text-sm">{type}</span>
        </div>
      )
    },
  },
  {
    accessorKey: 'category',
    header: 'Category',
    cell: ({ row }) => (
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{row.original.category}</div>
        {row.original.subcategory && (
          <div className="text-xs text-muted-foreground">{row.original.subcategory}</div>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'account',
    header: 'Account',
    cell: ({ row }) => <span className="text-sm">{row.original.account}</span>,
  },
  {
    accessorKey: 'amount',
    header: ({ column }) => (
      <button
        onClick={() => column.toggleSorting()}
        className="flex items-center gap-2 hover:text-primary transition-colors"
      >
        Amount
        <ArrowUpDown className="w-4 h-4" />
      </button>
    ),
    cell: ({ row }) => {
      const amount = row.original.amount
      const type = row.original.type
      const isIncome = type === 'Income'
      const isTransfer = type === 'Transfer'

      const colorClass = (() => {
        if (isTransfer) return 'text-ios-blue'
        if (isIncome) return 'text-ios-green'
        return 'text-ios-red'
      })()

      const prefix = (() => {
        if (isTransfer) return ''
        if (isIncome) return '+'
        return '-'
      })()

      return (
        <span className={`text-sm font-semibold ${colorClass}`}>
          {prefix}
          {formatCurrency(Math.abs(amount))}
        </span>
      )
    },
  },
  {
    accessorKey: 'note',
    header: 'Note',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
        {row.original.note || '-'}
      </span>
    ),
  },
]

export default function TransactionTable({ transactions, isLoading, sorting, onSortingChange }: Readonly<TransactionTableProps>) {

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
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
    onSortingChange: handleSortingChange,
    manualSorting: true,
  })

  if (isLoading) {
    return (
      <div className="glass rounded-xl border border-border overflow-hidden">
        {/* Desktop skeleton */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/20 border-b border-border">
              <tr>
                {Array.from({ length: 6 }, (_, i) => (
                  <th key={`skeleton-header-${i}`} className="px-6 py-3 text-left">
                    <div className="h-4 skeleton w-20" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }, (_, i) => (
                <tr key={`skeleton-row-${i}`} className="border-b border-border">
                  {Array.from({ length: 6 }, (_, j) => (
                    <td key={`skeleton-cell-${i}-${j}`} className="px-6 py-4">
                      <div className="h-4 skeleton w-full" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile skeleton */}
        <div className="md:hidden divide-y divide-white/5 p-4 space-y-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={`skeleton-card-${i}`} className="p-4 rounded-xl bg-white/5 space-y-3">
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
      <div className="glass rounded-xl border border-border shadow-lg">
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
      className="glass rounded-xl border border-border overflow-hidden shadow-xl"
    >
      {/* Desktop table */}
      <div className="hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/20 border-b border-border">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-6 py-3 text-left text-sm font-semibold">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
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
                  className="border-b border-border hover:bg-white/10 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-6 py-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </motion.tbody>
          </table>
        </div>
      </div>

      {/* Mobile card view — grouped by day with daily totals */}
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
                <div className="sticky top-0 z-10 px-4 py-2 bg-background/90 backdrop-blur-sm flex items-center justify-between border-b border-border">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {format(new Date(dateKey), 'EEE, MMM dd yyyy')}
                  </span>
                  <span className={`text-xs font-semibold ${dayTotal >= 0 ? 'text-ios-green' : 'text-ios-red'}`}>
                    {dayTotal >= 0 ? '+' : ''}{formatCurrency(dayTotal)}
                  </span>
                </div>
                {/* Day transactions */}
                <div className="divide-y divide-white/5">
                  {dayRows.map((row) => {
                    const tx = row.original
                    const isIncome = tx.type === 'Income'
                    const isTransfer = tx.type === 'Transfer'
                    const amountColor = isTransfer ? 'text-ios-teal' : isIncome ? 'text-ios-green' : 'text-ios-red'
                    const prefix = isTransfer ? '' : isIncome ? '+' : '-'
                    const TypeIcon = isIncome ? TrendingUp : TrendingDown

                    return (
                      <div key={row.id} className="p-4 hover:bg-white/10 transition-colors">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            {isTransfer ? (
                              <span className="text-ios-teal text-sm">→</span>
                            ) : (
                              <TypeIcon className={`w-3.5 h-3.5 ${isIncome ? 'text-ios-green' : 'text-ios-red'}`} />
                            )}
                            <span className="text-sm font-medium">{tx.category}</span>
                            {tx.subcategory && (
                              <span className="text-xs text-muted-foreground">/ {tx.subcategory}</span>
                            )}
                          </div>
                          <span className={`text-sm font-semibold ${amountColor}`}>
                            {prefix}{formatCurrency(Math.abs(tx.amount))}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{tx.account}</span>
                          {tx.note && <span className="truncate max-w-[150px]">{tx.note}</span>}
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
