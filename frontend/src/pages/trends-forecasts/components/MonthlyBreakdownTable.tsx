import { motion } from 'framer-motion'
import { TrendingUp } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import { DataTable, type DataTableColumn } from '@/components/ui'
import { formatCurrency } from '@/lib/formatters'

import type { MonthlyTrendRow } from '../types'

interface Props {
  readonly isLoading: boolean
  readonly chartData: readonly MonthlyTrendRow[]
}

const COLUMNS: DataTableColumn<MonthlyTrendRow>[] = [
  {
    key: 'month',
    header: 'Month',
    cell: (row) => <span className="font-medium text-white">{row.month}</span>,
  },
  {
    key: 'income',
    header: 'Income',
    align: 'right',
    sortable: true,
    cell: (row) => <span className="text-app-green">{formatCurrency(row.income)}</span>,
  },
  {
    key: 'expenses',
    header: 'Spending',
    align: 'right',
    sortable: true,
    cell: (row) => <span className="text-app-red">{formatCurrency(row.expenses)}</span>,
  },
  {
    key: 'surplus',
    header: 'Savings',
    align: 'right',
    sortable: true,
    cell: (row) => (
      <span className={`font-bold ${row.surplus >= 0 ? 'text-app-purple' : 'text-app-red'}`}>
        {formatCurrency(row.surplus)}
      </span>
    ),
  },
  {
    key: 'rawSavingsRate',
    header: 'Savings Rate',
    align: 'right',
    sortable: true,
    cell: (row) => (
      <span className={row.rawSavingsRate >= 0 ? 'text-foreground' : 'text-app-red'}>
        {row.rawSavingsRate.toFixed(1)}%
      </span>
    ),
  },
]

export default function MonthlyBreakdownTable({ isLoading, chartData }: Readonly<Props>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <h3 className="text-lg font-semibold text-white mb-4">Month-on-Month Breakdown</h3>
      {isLoading && <div className="text-center py-8 text-muted-foreground">Loading data...</div>}
      {!isLoading && chartData.length > 0 && (
        <DataTable<MonthlyTrendRow>
          columns={COLUMNS}
          rows={chartData}
          rowKey={(row) => row.month}
          ariaLabel="Month on month breakdown"
        />
      )}
      {!isLoading && chartData.length === 0 && (
        <EmptyState
          icon={TrendingUp}
          title="No data available"
          description="Monthly breakdown will appear here once you have transactions."
          variant="compact"
        />
      )}
    </motion.div>
  )
}
