import { useMemo } from 'react'
import { motion } from 'framer-motion'

import { ProgressBar } from '@/components/shared'
import { DataTable, type DataTableColumn } from '@/components/ui'
import { fadeUpItem } from '@/constants/animations'
import { rawColors } from '@/constants/colors'
import { formatCurrencyCompact } from '@/lib/formatters'
import type { GSTCategoryBreakdown, GSTSummary } from '@/lib/gstCalculator'

import { GST_SLAB_COLORS } from '../constants'

interface Props {
  data: GSTSummary
}

export default function GSTCategoryTable({ data }: Readonly<Props>) {
  const columns = useMemo(() => {
    const maxSpending = Math.max(0, ...data.categoryBreakdown.map((category) => category.spending))
    return buildColumns(maxSpending)
  }, [data.categoryBreakdown])

  return (
    <motion.div
      variants={fadeUpItem}
      className="glass rounded-2xl border border-border overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-medium text-muted-foreground">GST by Category</h3>
      </div>
      <DataTable<GSTCategoryBreakdown>
        columns={columns}
        rows={data.categoryBreakdown}
        rowKey={(category) => category.category}
        initialSort={{ key: 'gstAmount', dir: 'desc' }}
        ariaLabel="GST estimated per category"
        mobileCards
      />
      <div className="border-t border-border bg-[var(--overlay-1)] px-4 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-sm">
        <span className="font-semibold text-foreground">Total</span>
        <span className="flex items-center gap-4 tabular-nums">
          <span className="font-semibold">{formatCurrencyCompact(data.totalSpending)}</span>
          <span className="font-semibold text-muted-foreground">
            {data.effectiveRate.toFixed(1)}%
          </span>
          <span className="font-semibold text-app-indigo">
            {formatCurrencyCompact(data.totalGST)}
          </span>
        </span>
      </div>
    </motion.div>
  )
}

function buildColumns(maxSpending: number): DataTableColumn<GSTCategoryBreakdown>[] {
  return [
    {
      key: 'category',
      header: 'Category',
      sortType: 'text',
      mobilePrimary: true,
      cell: (category) => (
        <>
          <span className="font-medium text-foreground">{category.category}</span>
          {category.parentCategory !== category.category && (
            <span className="text-xs text-muted-foreground ml-2">
              {category.parentCategory}
            </span>
          )}
        </>
      ),
    },
    {
      key: 'spending',
      header: 'Spending',
      align: 'right',
      sortable: true,
      sortValue: (category) => category.spending,
      cell: (category) => (
        <div className="flex items-center justify-end gap-2.5">
          <ProgressBar
            value={category.spending}
            max={maxSpending}
            color={rawColors.app.indigo}
            height={6}
            className="w-16 sm:w-20 shrink-0"
            ariaLabel={`${category.category} spending share`}
          />
          <span className="tabular-nums">{formatCurrencyCompact(category.spending)}</span>
        </div>
      ),
    },
    {
      key: 'gstRate',
      header: 'GST Rate',
      align: 'right',
      cell: (category) => (
        <span
          className="inline-flex px-2 py-0.5 rounded-md text-xs font-medium"
          style={{
            backgroundColor: `${GST_SLAB_COLORS[category.gstRate] ?? rawColors.app.blue}20`,
            color: GST_SLAB_COLORS[category.gstRate] ?? rawColors.app.blue,
          }}
        >
          {category.gstRate}%
        </span>
      ),
    },
    {
      key: 'gstAmount',
      header: 'Est. GST',
      align: 'right',
      sortable: true,
      cell: (category) => (
        <span className="text-app-indigo font-medium">
          {formatCurrencyCompact(category.gstAmount)}
        </span>
      ),
    },
    {
      key: 'transactionCount',
      header: 'Txns',
      align: 'right',
      sortable: true,
      widthClass: 'hidden sm:table-cell',
      cellClassName: () => 'hidden sm:table-cell',
      cell: (category) => (
        <span className="text-muted-foreground">{category.transactionCount}</span>
      ),
    },
  ]
}
