import { useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowUpDown, TrendingUp, TrendingDown } from 'lucide-react'
import type { Transaction } from '@/types'
import { format } from 'date-fns'
import { motion } from 'framer-motion'

interface TransactionTableProps {
  transactions: Transaction[]
  isLoading?: boolean
  sorting: SortingState
  onSortingChange: (sorting: SortingState) => void
}

export default function TransactionTable({ transactions, isLoading, sorting, onSortingChange }: TransactionTableProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(value))
  }

  const columns = useMemo<ColumnDef<Transaction>[]>(
    () => [
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
          const isIncome = type === 'Income'
          const isTransfer = type === 'Transfer'
          return (
            <div className="flex items-center gap-2">
              {isIncome ? (
                <TrendingUp className="w-4 h-4 text-green-500" />
              ) : isTransfer ? (
                <span className="text-blue-500">→</span>
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )}
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
          const isIncome = amount >= 0
          return (
            <span className={`text-sm font-semibold ${isIncome ? 'text-green-500' : 'text-red-500'}`}>
              {isIncome ? '+' : '-'}
              {formatCurrency(amount)}
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
    ],
    []
  )

  const table = useReactTable({
    data: transactions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
    onSortingChange,
    manualSorting: true,
  })

  if (isLoading) {
    return (
      <div className="glass rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/20 border-b border-white/10">
              <tr>
                {[...Array(6)].map((_, i) => (
                  <th key={i} className="px-6 py-3 text-left">
                    <div className="h-4 bg-muted rounded w-20 animate-pulse" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(10)].map((_, i) => (
                <tr key={i} className="border-b border-white/5">
                  {[...Array(6)].map((_, j) => (
                    <td key={j} className="px-6 py-4">
                      <div className="h-4 bg-muted rounded w-full animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="glass rounded-xl border border-white/10 p-12 text-center">
        <p className="text-muted-foreground">No transactions found. Try adjusting your filters.</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl border border-white/10 overflow-hidden shadow-xl"
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/20 border-b border-white/10">
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
          <tbody>
            {table.getRowModel().rows.map((row, index) => (
              <motion.tr
                key={row.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.02 }}
                className="border-b border-white/5 hover:bg-white/5 transition-colors"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-6 py-4">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}
