import { motion } from 'framer-motion'
import { ArrowRight, FileSpreadsheet } from 'lucide-react'

import { DataTable, Money, type DataTableColumn } from '@/components/ui'
import { getSemanticBadgeClass } from '@/constants/chartColors'
import { cn } from '@/lib/cn'

interface SampleTransaction {
  readonly date: string
  readonly account: string
  readonly category: string
  readonly subcategory: string
  readonly type: string
  readonly amount: number
  readonly note: string
}

const SAMPLE_EXCEL_DATA: readonly SampleTransaction[] = [
  { date: '2024-01-15', account: 'HDFC Bank', category: 'Salary', subcategory: 'Monthly', type: 'Income', amount: 85000, note: 'Jan Salary' },
  { date: '2024-01-16', account: 'HDFC Bank', category: 'Food', subcategory: 'Groceries', type: 'Expense', amount: 3500, note: 'Big Basket' },
  { date: '2024-01-18', account: 'ICICI Card', category: 'Shopping', subcategory: 'Electronics', type: 'Expense', amount: 15999, note: 'Headphones' },
  { date: '2024-01-20', account: 'HDFC Bank', category: 'Investment', subcategory: 'Mutual Fund', type: 'Transfer-Out', amount: 10000, note: 'SIP' },
]

const TYPE_STYLES: Record<string, string> = {
  Income: getSemanticBadgeClass('Income'),
  Expense: getSemanticBadgeClass('Expense'),
  'Transfer-Out': getSemanticBadgeClass('Transfer-Out'),
  'Transfer-In': getSemanticBadgeClass('Transfer-In'),
}

const COLUMNS: readonly DataTableColumn<SampleTransaction>[] = [
  {
    key: 'date',
    header: 'Date',
    cell: (row) => <span className="font-mono text-xs">{row.date}</span>,
  },
  {
    key: 'account',
    header: 'Account',
    mobilePrimary: true,
    cell: (row) => <span className="font-medium text-foreground">{row.account}</span>,
  },
  {
    key: 'category',
    header: 'Category',
    cell: (row) => row.category,
  },
  {
    key: 'subcategory',
    header: 'Subcategory',
    cell: (row) => <span className="text-text-tertiary">{row.subcategory}</span>,
  },
  {
    key: 'type',
    header: 'Type',
    cell: (row) => (
      <span
        className={cn(
          'rounded border px-2 py-0.5 text-xs font-medium',
          TYPE_STYLES[row.type] || 'bg-muted-foreground/20 text-muted-foreground',
        )}
      >
        {row.type}
      </span>
    ),
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    cell: (row) => <Money value={row.amount} />,
  },
  {
    key: 'note',
    header: 'Note',
    cell: (row) => <span className="text-xs text-text-tertiary">{row.note}</span>,
  },
]

export default function UploadFormatPreview() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="space-y-3"
      aria-labelledby="expected-format-title"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-md border border-app-blue/15 bg-primary/10 p-2">
          <FileSpreadsheet className="size-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 id="expected-format-title" className="text-lg font-semibold text-foreground">
            Expected Format
          </h2>
          <p className="text-sm text-muted-foreground">
            Your Excel or CSV should include these transaction fields
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-[var(--overlay-1)]">
        <DataTable
          columns={COLUMNS}
          rows={SAMPLE_EXCEL_DATA}
          rowKey={(row) => `${row.date}-${row.amount}-${row.note}`}
          ariaLabel="Example transaction import spreadsheet with supported columns"
          animateRows={false}
          mobileCards
        />
        <div className="flex items-start gap-2 border-t border-border bg-[var(--overlay-2)] px-4 py-3">
          <ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-pretty text-xs text-muted-foreground">
            Column names are flexible -- <span className="text-foreground">"Period"</span> or{' '}
            <span className="text-foreground">"Date"</span> both work. Export from Money Manager
            Pro for best results.
          </p>
        </div>
      </div>
    </motion.section>
  )
}
