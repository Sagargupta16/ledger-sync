import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

import { ProgressBar } from '@/components/shared'
import { colors } from '@/constants/colors'
import { usePreferences } from '@/hooks/api/usePreferences'
import { formatCurrencyCompact, formatPercent } from '@/lib/formatters'

import type { useYearInReview } from '../useYearInReview'

import StatCard from './StatCard'

type YearStats = ReturnType<typeof useYearInReview>['stats']

interface YearStatsGridProps {
  readonly stats: YearStats
}

const DEFAULT_SAVINGS_GOAL = 20

export default function YearStatsGrid({ stats }: YearStatsGridProps) {
  const savingsGoal = usePreferences().data?.savings_goal_percent ?? DEFAULT_SAVINGS_GOAL
  const savingsColor = stats.savingsRate >= savingsGoal ? colors.app.green : colors.app.orange
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-5 border-b border-border pb-6 min-[360px]:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Total Spending"
        value={formatCurrencyCompact(stats.totalExpense)}
        icon={TrendingDown}
        color={colors.app.red}
      />
      <StatCard
        label="Total Earning"
        value={formatCurrencyCompact(stats.totalIncome)}
        icon={TrendingUp}
        color={colors.app.green}
      />
      <StatCard
        label="Savings Rate"
        value={formatPercent(stats.savingsRate)}
        icon={stats.savingsRate >= 0 ? ArrowUpRight : ArrowDownRight}
        color={savingsColor}
        footer={
          <ProgressBar
            value={stats.savingsRate}
            max={Math.max(50, savingsGoal * 2.5)}
            target={savingsGoal}
            color={savingsColor}
            height={6}
            ariaLabel={`Savings rate ${stats.savingsRate.toFixed(1)} percent against a ${savingsGoal} percent target`}
          />
        }
      />
      <StatCard
        label="Daily Average"
        value={formatCurrencyCompact(stats.dailyAvg)}
        icon={BarChart3}
        color={colors.app.blue}
      />
    </div>
  )
}
