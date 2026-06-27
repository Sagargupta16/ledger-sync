import { motion } from 'framer-motion'

import { DataTable, type DataTableColumn } from '@/components/ui'
import { formatCurrency, formatPercent } from '@/lib/formatters'

interface PortfolioRow {
  name: string
  value: number
  percentage: string
}

interface AccountsTableProps {
  portfolioData: Array<PortfolioRow>
  /** Total accounts before the top-8 cap, so we can surface a "+N more" note. */
  totalAccountCount: number
}

function buildColumns(): DataTableColumn<PortfolioRow>[] {
  return [
    {
      key: 'name',
      header: 'Account',
      sortable: true,
      sortType: 'text',
      cell: (row) => <span className="text-white font-medium">{row.name}</span>,
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.value,
      cell: (row) => <span className="text-app-green">{formatCurrency(row.value)}</span>,
    },
    {
      key: 'percentage',
      header: 'Allocation',
      align: 'right',
      sortable: true,
      sortValue: (row) => Number.parseFloat(row.percentage),
      cell: (row) => (
        <span className="text-app-purple">{formatPercent(Number.parseFloat(row.percentage))}</span>
      ),
    },
  ]
}

export function AccountsTable({
  portfolioData,
  totalAccountCount,
}: Readonly<AccountsTableProps>) {
  const columns = buildColumns()
  const cappedCount = portfolioData.length

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <h3 className="text-lg font-semibold text-white mb-4">Investment Accounts</h3>
      <DataTable<PortfolioRow>
        columns={columns}
        rows={portfolioData}
        rowKey={(row) => row.name}
        initialSort={{ key: 'value', dir: 'desc' }}
        ariaLabel="Investment accounts by value and allocation"
      />
      {totalAccountCount > cappedCount && (
        <p className="mt-3 text-xs text-text-tertiary">
          Showing the top {cappedCount} accounts by value. +{totalAccountCount - cappedCount} more
          not shown.
        </p>
      )}
    </motion.div>
  )
}
