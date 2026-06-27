import { type ColumnDef } from '@tanstack/react-table'
import { ArrowUpDown, TrendingUp, TrendingDown } from 'lucide-react'

import type { Transaction } from '@/types'
import { formatCurrency, formatDate } from '@/lib/formatters'

export const transactionColumns: ColumnDef<Transaction>[] = [
  {
    accessorKey: 'date',
    header: ({ column }) => (
      <button
        onClick={() => column.toggleSorting()}
        className="flex items-center gap-2 text-text-tertiary hover:text-white transition-colors duration-150"
      >
        Date
        <ArrowUpDown className="w-4 h-4" />
      </button>
    ),
    cell: ({ row }) => (
      <span className="text-sm text-text-tertiary">{formatDate(row.original.date, { month: 'short', day: '2-digit', year: 'numeric' })}</span>
    ),
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => {
      const type = row.original.type
      const typeIcon = (() => {
        if (type === 'Income') return <TrendingUp className="w-4 h-4 text-app-green" />
        if (type === 'Transfer') return <span className="text-app-blue">→</span>
        return <TrendingDown className="w-4 h-4 text-app-red" />
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
        <div className="text-sm font-medium text-muted-foreground">{row.original.category}</div>
        {row.original.subcategory && (
          <div className="text-xs text-text-tertiary">{row.original.subcategory}</div>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'account',
    header: 'Account',
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.account}</span>,
  },
  {
    accessorKey: 'amount',
    header: ({ column }) => (
      <button
        onClick={() => column.toggleSorting()}
        className="flex items-center gap-2 text-text-tertiary hover:text-white transition-colors duration-150"
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
        if (isTransfer) return 'text-app-teal'
        if (isIncome) return 'text-app-green'
        return 'text-app-red'
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
      <span className="text-sm text-text-tertiary truncate max-w-[120px] lg:max-w-[200px] block">
        {row.original.note || '-'}
      </span>
    ),
  },
]
