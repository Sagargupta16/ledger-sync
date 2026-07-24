import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

import { ProgressBar } from '@/components/shared'
import { rawColors } from '@/constants/colors'
import { formatCurrencyCompact } from '@/lib/formatters'

import type { useYearInReview } from '../useYearInReview'

import StatCard from './StatCard'

type YearStats = ReturnType<typeof useYearInReview>['stats']

interface YearStatsGridProps {
  readonly stats: YearStats
}

export default function YearStatsGrid({ stats }: YearStatsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4">
      <StatCard
        label="Total Spending"
        value={formatCurrencyCompact(stats.totalExpense)}
        icon={TrendingDown}
        color={rawColors.app.red}
      />
      <StatCard
        label="Total Earning"
        value={formatCurrencyCompact(stats.totalIncome)}
        icon={TrendingUp}
        color={rawColors.app.green}
      />
      <StatCard
        label="Savings Rate"
        value={`${stats.savingsRate.toFixed(1)}%`}
        icon={stats.savingsRate >= 0 ? ArrowUpRight : ArrowDownRight}
        color={stats.savingsRate >= 20 ? rawColors.app.green : rawColors.app.orange}
        footer={
          <ProgressBar
            value={stats.savingsRate}
            max={50}
            target={20}
            color={stats.savingsRate >= 20 ? rawColors.app.green : rawColors.app.orange}
            height={6}
            ariaLabel={`Savings rate ${stats.savingsRate.toFixed(1)} percent against a 20 percent target`}
          />
        }
      />
      <StatCard
        label="Daily Average"
        value={formatCurrencyCompact(stats.dailyAvg)}
        icon={BarChart3}
        color={rawColors.app.blue}
      />
    </div>
  )
}
