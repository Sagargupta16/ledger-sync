import { motion } from 'framer-motion'

import { ProgressBar } from '@/components/shared'
import { DataTable, type DataTableColumn } from '@/components/ui'
import { rawColors } from '@/constants/colors'
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

function buildColumns(maxAllocation: number): DataTableColumn<PortfolioRow>[] {
  return [
    {
      key: 'name',
      header: 'Account',
      sortable: true,
      sortType: 'text',
      mobilePrimary: true,
      cell: (row) => <span className="text-foreground font-medium">{row.name}</span>,
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.value,
      mobileLabel: 'Value',
      cell: (row) => <span className="text-app-green">{formatCurrency(row.value)}</span>,
    },
    {
      key: 'percentage',
      header: 'Allocation',
      align: 'right',
      sortable: true,
      sortValue: (row) => Number.parseFloat(row.percentage),
      mobileLabel: 'Allocation',
      cell: (row) => {
        const pct = Number.parseFloat(row.percentage)
        return (
          <div className="flex items-center justify-end gap-2.5">
            <ProgressBar
              value={pct}
              max={maxAllocation}
              color={rawColors.app.purple}
              height={6}
              className="w-16 sm:w-20 shrink-0"
              ariaLabel={`${row.name} allocation share`}
            />
            <span className="text-app-purple tabular-nums">{formatPercent(pct)}</span>
          </div>
        )
      },
    },
  ]
}

export function AccountsTable({
  portfolioData,
  totalAccountCount,
}: Readonly<AccountsTableProps>) {
  const maxAllocation = Math.max(
    0,
    ...portfolioData.map((row) => Number.parseFloat(row.percentage)),
  )
  const columns = buildColumns(maxAllocation)
  const cappedCount = portfolioData.length

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <h3 className="text-lg font-semibold text-foreground mb-4">Investment Accounts</h3>
      <DataTable<PortfolioRow>
        columns={columns}
        rows={portfolioData}
        rowKey={(row) => row.name}
        initialSort={{ key: 'value', dir: 'desc' }}
        ariaLabel="Investment accounts by value and allocation"
        mobileCards
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
