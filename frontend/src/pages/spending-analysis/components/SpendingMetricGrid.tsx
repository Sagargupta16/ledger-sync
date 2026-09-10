import { motion } from 'motion/react'

import Sparkline from '@/components/shared/Sparkline'
import { FADE_UP } from '@/constants/animations'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

interface SpendingMetricGridProps {
  readonly totalSpending: number
  readonly monthlyAvgSpending: number
  /** States the divisor and, when the distribution is skewed, the typical month. */
  readonly monthlyAvgSubtitle: string
  readonly monthlyTrendData: Array<{ expense: number }>
  readonly topCategory: string
  readonly topCategoryAmount: number
  readonly categoriesCount: number
  readonly subcategoriesCount: number
}

export default function SpendingMetricGrid({
  totalSpending,
  monthlyAvgSpending,
  monthlyAvgSubtitle,
  monthlyTrendData,
  topCategory,
  topCategoryAmount,
  categoriesCount,
  subcategoriesCount,
}: SpendingMetricGridProps) {
  return (
    <motion.dl
      {...FADE_UP}
      className="grid grid-cols-1 gap-x-6 gap-y-5 border-b border-border pb-6 min-[360px]:grid-cols-2 xl:grid-cols-[1.2fr_1.1fr_1fr_0.8fr]"
      aria-label="Spending summary"
    >
      <div className="min-w-0">
        <dt className="ledger-meta text-app-red">Total Spending</dt>
        <dd className="mt-2 break-words font-mono text-2xl font-semibold tracking-tight tabular-nums text-foreground sm:text-3xl">
          {formatCurrency(totalSpending)}
        </dd>
        <dd className="mt-2 text-xs text-muted-foreground">Selected period</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground">Monthly Avg</dt>
        <dd className="mt-2 break-words font-mono text-xl font-semibold tabular-nums text-foreground">
          {formatCurrency(monthlyAvgSpending)}
        </dd>
        <dd className="mt-2 text-xs leading-relaxed text-muted-foreground">{monthlyAvgSubtitle}</dd>
        {monthlyTrendData.length >= 2 && (
          <dd className="mt-2 max-w-40">
            <Sparkline
              data={monthlyTrendData.map((item) => item.expense)}
              color={rawColors.app.red}
              height={32}
              showTooltip={false}
              ariaLabel="Monthly spending trend"
            />
          </dd>
        )}
      </div>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground">Top Category</dt>
        <dd className="mt-2 break-words text-lg font-semibold text-foreground">{topCategory}</dd>
        {topCategoryAmount > 0 && (
          <dd className="mt-2 font-mono text-sm tabular-nums text-app-red">{formatCurrency(topCategoryAmount)}</dd>
        )}
      </div>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground">Categories</dt>
        <dd className="mt-2 font-mono text-xl font-semibold tabular-nums text-foreground">
          {categoriesCount}<span className="px-1 text-muted-foreground">/</span>{subcategoriesCount}
        </dd>
        <dd className="mt-2 text-xs text-muted-foreground">Categories / Subcategories</dd>
      </div>
    </motion.dl>
  )
}
