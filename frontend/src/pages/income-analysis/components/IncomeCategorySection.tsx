import { motion } from 'motion/react'
import {
  Activity,
  Briefcase,
  DollarSign,
  PiggyBank,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import StandardPieChart from '@/components/analytics/StandardPieChart'
import EmptyState from '@/components/shared/EmptyState'
import { formatCurrency } from '@/lib/formatters'

import type { IncomeCategoryDatum } from '../useIncomeAnalysis'

/**
 * Category -> icon. Cosmetic only (unmatched keys fall back to DollarSign), but
 * the keys still have to match reality: real exports carry "Refunds &
 * Cashbacks" (PLURAL), so the singular key alone showed the generic icon for
 * every cashback and refund row. Both spellings are mapped.
 */
const INCOME_CATEGORY_ICONS: Record<string, LucideIcon> = {
  'Employment Income': Briefcase,
  'Investment Income': TrendingUp,
  'Refund & Cashbacks': Wallet,
  'Refunds & Cashbacks': Wallet,
  'One-time Income': PiggyBank,
  'Other Income': DollarSign,
  'Business/Self Employment Income': Activity,
}

interface IncomeCategorySectionProps {
  readonly data: readonly IncomeCategoryDatum[]
  readonly totalIncome: number
  readonly onSelectCategory: (name: string) => void
}

export default function IncomeCategorySection({
  data,
  totalIncome,
  onSelectCategory,
}: IncomeCategorySectionProps) {
  return (
    <motion.section
      className="glass rounded-xl border border-border p-4 md:p-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      aria-labelledby="income-category-title"
    >
      <h2 id="income-category-title" className="mb-4 text-lg font-semibold text-foreground">
        Income by Category
      </h2>

      {data.length > 0 ? (
        <div className="flex flex-col items-center gap-4 md:gap-6 lg:flex-row lg:gap-8">
          {/* No role="img" wrapper here -- it would enclose the chart's sr-only
              data table and ARIA presentational children would hide it again.
              `ariaLabel` puts the label on the chart's own wrapper instead. */}
          <div className="w-64">
            <StandardPieChart
              data={[...data]}
              height={256}
              innerRadius={50}
              outerRadius={90}
              showLegend={false}
              onSliceClick={onSelectCategory}
              ariaLabel="Donut chart breaking down total income by source category"
            />
          </div>
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            {data.map((item) => {
              const Icon = INCOME_CATEGORY_ICONS[item.category] || DollarSign
              const percentage =
                totalIncome > 0 ? ((item.value / totalIncome) * 100).toFixed(1) : '0'

              return (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => onSelectCategory(item.name)}
                  className="w-full rounded-lg border border-[var(--hairline-1)] bg-surface-dropdown/30 p-4 text-left transition-colors hover:bg-[var(--overlay-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="mb-2 flex items-center gap-3">
                    <div
                      className="rounded-lg p-2"
                      style={{ backgroundColor: `${item.color}20` }}
                    >
                      <Icon className="size-5" style={{ color: item.color }} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <p className="truncate font-medium text-foreground">{item.name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{percentage}% of income</p>
                    </div>
                  </div>
                  <p className="ledger-figure text-xl font-bold" style={{ color: item.color }}>
                    {formatCurrency(item.value)}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        /*
          Pointed at Settings ("Configure income categories") and it could not
          help: this breakdown is the backend's `category_breakdown`, which
          buckets income rows by `transaction.category` alone
          (`calculations_helpers.py::_compute_income_analysis`). The Settings
          income-classification lists drive the cashback total, nothing here, so
          a user who followed that advice classified categories and watched the
          chart stay empty. The two causes that DO empty it are no income rows at
          all and a date range with none in it -- so the action matches the
          sibling `IncomeTrendSection` and points at /upload, with the range
          named as the second cause.
        */
        <EmptyState
          icon={Wallet}
          title="No income data available"
          description="Start by uploading your transaction data to see income by category. Already uploaded? Widen the selected date range."
          actionLabel="Upload Data"
          actionHref="/upload"
          variant="chart"
        />
      )}
    </motion.section>
  )
}
