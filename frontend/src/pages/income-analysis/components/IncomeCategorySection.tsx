import { motion } from 'framer-motion'
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

const INCOME_CATEGORY_ICONS: Record<string, LucideIcon> = {
  'Employment Income': Briefcase,
  'Investment Income': TrendingUp,
  'Refund & Cashbacks': Wallet,
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
          <div
            className="w-64"
            role="img"
            aria-label="Donut chart breaking down total income by source category"
          >
            <StandardPieChart
              data={[...data]}
              height={256}
              innerRadius={50}
              outerRadius={90}
              showLegend={false}
              onSliceClick={onSelectCategory}
            />
          </div>
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            {data.map((item) => {
              const Icon = INCOME_CATEGORY_ICONS[item.category] || DollarSign
              const percentage =
                totalIncome > 0 ? ((item.value / totalIncome) * 100).toFixed(1) : '0'

              return (
                <div
                  key={item.name}
                  className="rounded-lg border border-[var(--hairline-1)] bg-surface-dropdown/30 p-4 transition-colors hover:bg-[var(--overlay-2)]"
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
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={Wallet}
          title="No income type data available"
          description="Configure income categories in Settings to see breakdown."
          actionLabel="Go to Settings"
          actionHref="/settings"
        />
      )}
    </motion.section>
  )
}
