import { type Column, type ColumnDef } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, TrendingUp, TrendingDown } from 'lucide-react'

import type { Transaction } from '@/types'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { Button } from '@/components/ui'

import TagChips from './TagChips'
import TagEditor from './TagEditor'

/** Table meta threaded from TransactionTable (facet tag names for TagEditor). */
export interface TransactionTableMeta {
  availableTags: string[]
}

/** Direction-aware sort icon for a sortable column header. */
function sortIcon(column: Column<Transaction, unknown>) {
  const sorted = column.getIsSorted()
  if (sorted === 'asc') return <ArrowUp className="w-4 h-4" aria-hidden="true" />
  if (sorted === 'desc') return <ArrowDown className="w-4 h-4" aria-hidden="true" />
  return <ArrowUpDown className="w-4 h-4 opacity-60" aria-hidden="true" />
}

export const transactionColumns: ColumnDef<Transaction>[] = [
  {
    accessorKey: 'date',
    header: ({ column }) => (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => column.toggleSorting()}
        className="px-0 text-text-tertiary hover:text-foreground"
      >
        Date
        {sortIcon(column)}
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-sm text-text-tertiary">{formatDate(row.original.date, { month: 'short', day: '2-digit', year: 'numeric' })}</span>
    ),
  },
  {
    accessorKey: 'type',
    header: 'Type',
    enableSorting: false,
    cell: ({ row }) => {
      const type = row.original.type
      const typeIcon = (() => {
        if (type === 'Income') return <TrendingUp className="w-4 h-4 text-app-green" />
        if (type === 'Transfer') return <span className="text-app-teal">→</span>
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
    enableSorting: false,
    cell: ({ row }) => (
      <div className="space-y-0.5">
        <div className="text-sm font-medium text-muted-foreground">{row.original.category}</div>
        {row.original.subcategory && (
          <div className="text-xs text-text-tertiary">{row.original.subcategory}</div>
        )}
        {row.original.tags && row.original.tags.length > 0 && (
          <TagChips tags={row.original.tags} />
        )}
      </div>
    ),
  },
  {
    accessorKey: 'account',
    header: 'Account',
    enableSorting: false,
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.account}</span>,
  },
  {
    accessorKey: 'amount',
    header: ({ column }) => (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => column.toggleSorting()}
        className="px-0 text-text-tertiary hover:text-foreground"
      >
        Amount
        {sortIcon(column)}
      </Button>
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
    enableSorting: false,
    cell: ({ row }) => (
      <span
        className="text-sm text-text-tertiary truncate max-w-[120px] lg:max-w-[200px] block"
        title={row.original.note || undefined}
      >
        {row.original.note || '-'}
      </span>
    ),
  },
  {
    id: 'actions',
    header: '',
    enableSorting: false,
    cell: ({ row, table }) => {
      const meta = table.options.meta as TransactionTableMeta | undefined
      return (
        <TagEditor
          transactionId={row.original.id}
          tags={row.original.tags ?? []}
          availableTags={meta?.availableTags ?? []}
        />
      )
    },
  },
]
