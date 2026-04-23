import { motion } from 'framer-motion'
import { TrendingUp } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import EmptyState from '@/components/shared/EmptyState'
import { ariaSort } from '../trendsUtils'
import type { MonthlyTrendRow } from '../types'

interface Props {
  isLoading: boolean
  chartData: MonthlyTrendRow[]
  sortedChartData: MonthlyTrendRow[]
  trendSortKey: string | null
  trendSortDir: 'asc' | 'desc'
  toggleTrendSort: (key: string) => void
}

const SORT_KEYS: { key: string; label: string }[] = [
  { key: 'income', label: 'Income' },
  { key: 'expenses', label: 'Spending' },
  { key: 'surplus', label: 'Savings' },
  { key: 'rawSavingsRate', label: 'Savings Rate' },
]

export default function MonthlyBreakdownTable({
  isLoading,
  chartData,
  sortedChartData,
  trendSortKey,
  trendSortDir,
  toggleTrendSort,
}: Readonly<Props>) {
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
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">
                  Month
                </th>
                {SORT_KEYS.map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() => toggleTrendSort(key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleTrendSort(key)
                      }
                    }}
                    tabIndex={0}
                    aria-sort={ariaSort(trendSortKey, key, trendSortDir)}
                    className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground cursor-pointer hover:text-white select-none"
                  >
                    {label}{' '}
                    {trendSortKey === key && (trendSortDir === 'asc' ? '↑' : '↓')}
                  </th>
                ))}
              </tr>
            </thead>
            <motion.tbody
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {sortedChartData.map((trend) => (
                <tr
                  key={trend.month}
                  className="border-b border-border hover:bg-white/10 transition-colors"
                >
                  <td className="py-3 px-4 text-white font-medium">{trend.month}</td>
                  <td className="py-3 px-4 text-right text-app-green">
                    {formatCurrency(trend.income)}
                  </td>
                  <td className="py-3 px-4 text-right text-app-red">
                    {formatCurrency(trend.expenses)}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-bold ${trend.surplus >= 0 ? 'text-app-purple' : 'text-app-red'}`}
                  >
                    {formatCurrency(trend.surplus)}
                  </td>
                  <td
                    className={`py-3 px-4 text-right ${trend.rawSavingsRate >= 0 ? 'text-foreground' : 'text-app-red'}`}
                  >
                    {trend.rawSavingsRate.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </motion.tbody>
          </table>
        </div>
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
