import { TrendingUp } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
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
    mobilePrimary: true,
    cell: (row) => <span className="font-medium text-foreground">{row.month}</span>,
  },
  {
    key: 'income',
    header: 'Income',
    align: 'right',
    sortable: true,
    cell: (row) => (
      <span className="ledger-figure text-app-green">{formatCurrency(row.income)}</span>
    ),
  },
  {
    key: 'expenses',
    header: 'Spending',
    align: 'right',
    sortable: true,
    cell: (row) => (
      <span className="ledger-figure text-app-red">{formatCurrency(row.expenses)}</span>
    ),
  },
  {
    key: 'surplus',
    header: 'Savings',
    align: 'right',
    sortable: true,
    cell: (row) => (
      <span
        className={`ledger-figure font-bold ${
          row.surplus >= 0 ? 'text-app-blue' : 'text-app-red'
          }`}
      >
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
      <span
        className={`ledger-figure ${
          row.rawSavingsRate >= 0 ? 'text-foreground' : 'text-app-red'
          }`}
      >
        {row.rawSavingsRate.toFixed(1)}%
      </span>
    ),
  },
]

export default function MonthlyBreakdownTable({ isLoading, chartData }: Readonly<Props>) {
  return (
    <section
      className="ledger-panel min-w-0 p-4 sm:p-6 [&_thead_button]:min-h-11"
      aria-labelledby="monthly-breakdown-title"
    >
      <p className="ledger-meta mb-2 text-app-blue">The figures behind the trend</p>
      <h2 id="monthly-breakdown-title" className="mb-5 text-xl font-semibold tracking-tight text-foreground">
        Month-on-Month Breakdown
      </h2>
      {isLoading && <TableSkeleton rows={5} />}
      {!isLoading && chartData.length > 0 && (
        <DataTable<MonthlyTrendRow>
          columns={COLUMNS}
          rows={chartData}
          rowKey={(row) => row.month}
          ariaLabel="Month on month breakdown"
          mobileCards
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
    </section>
  )
}
