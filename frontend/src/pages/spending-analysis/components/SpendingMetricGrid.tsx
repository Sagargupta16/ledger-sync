import { Activity, PieChart, Tag, TrendingDown } from 'lucide-react'

import MetricCard from '@/components/shared/MetricCard'
import Sparkline from '@/components/shared/Sparkline'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

interface SpendingMetricGridProps {
  readonly totalSpending: number
  readonly monthlyAvgSpending: number
  readonly monthlyTrendData: Array<{ expense: number }>
  readonly topCategory: string
  readonly topCategoryAmount: number
  readonly categoriesCount: number
  readonly subcategoriesCount: number
}

export default function SpendingMetricGrid({
  totalSpending,
  monthlyAvgSpending,
  monthlyTrendData,
  topCategory,
  topCategoryAmount,
  categoriesCount,
  subcategoriesCount,
}: SpendingMetricGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-6">
      <MetricCard
        title="Total Spending"
        value={formatCurrency(totalSpending)}
        icon={TrendingDown}
        color="red"
      />
      <MetricCard
        title="Monthly Avg"
        value={formatCurrency(monthlyAvgSpending)}
        icon={Activity}
        color="orange"
        subtitle="Average spending per month"
        trend={
          monthlyTrendData.length >= 2 ? (
            <Sparkline
              data={monthlyTrendData.map((item) => item.expense)}
              color={rawColors.app.orange}
              height={40}
              showTooltip={false}
            />
          ) : undefined
        }
      />
      <MetricCard
        title="Top Category"
        value={topCategory}
        icon={Tag}
        color="blue"
        subtitle={topCategoryAmount > 0 ? formatCurrency(topCategoryAmount) : undefined}
      />
      <MetricCard
        title="Categories"
        value={`${categoriesCount} / ${subcategoriesCount}`}
        icon={PieChart}
        color="purple"
        subtitle="Categories / Subcategories"
      />
    </div>
  )
}
