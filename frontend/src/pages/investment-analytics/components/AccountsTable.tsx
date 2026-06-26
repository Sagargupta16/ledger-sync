import { motion } from 'framer-motion'

import { formatCurrency, formatPercent } from '@/lib/formatters'

import { ariaSort } from '../investmentUtils'

interface AccountsTableProps {
  sortedPortfolioData: Array<{ name: string; value: number; percentage: string }>
  investSortKey: string | null
  investSortDir: 'asc' | 'desc'
  toggleInvestSort: (key: string) => void
}

export function AccountsTable({
  sortedPortfolioData,
  investSortKey,
  investSortDir,
  toggleInvestSort,
}: Readonly<AccountsTableProps>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <h3 className="text-lg font-semibold text-white mb-4">Investment Accounts</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">
                Account
              </th>
              <th
                onClick={() => toggleInvestSort('value')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleInvestSort('value')
                  }
                }}
                tabIndex={0}
                aria-sort={ariaSort(investSortKey, 'value', investSortDir)}
                className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground cursor-pointer hover:text-white select-none"
              >
                Value{' '}
                {investSortKey === 'value' && (investSortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => toggleInvestSort('percentage')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleInvestSort('percentage')
                  }
                }}
                tabIndex={0}
                aria-sort={ariaSort(investSortKey, 'percentage', investSortDir)}
                className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground cursor-pointer hover:text-white select-none"
              >
                Allocation{' '}
                {investSortKey === 'percentage' && (investSortDir === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedPortfolioData.map((item, index) => (
              <motion.tr
                key={item.name}
                className="border-b border-border hover:bg-white/10 transition-colors"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 + index * 0.05 }}
              >
                <td className="py-3 px-4 text-white font-medium">{item.name}</td>
                <td className="py-3 px-4 text-right text-app-green">
                  {formatCurrency(item.value)}
                </td>
                <td className="py-3 px-4 text-right text-app-purple">
                  {formatPercent(Number.parseFloat(item.percentage))}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}
