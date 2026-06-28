import { motion } from 'framer-motion'
import { Flame, Sun, Moon, TrendingDown, TrendingUp, BarChart3 } from 'lucide-react'

import { formatCurrencyCompact } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'

import InsightRow from './InsightRow'
import { getStreakColor } from '../heatmapUtils'
import type { useYearInReview } from '../useYearInReview'

type Stats = ReturnType<typeof useYearInReview>['stats']

interface YearInsightsPanelProps {
  readonly stats: Stats
}

function formatDayLabel(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

export default function YearInsightsPanel({ stats }: YearInsightsPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="glass rounded-2xl border border-border p-4 sm:p-6 space-y-4"
    >
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Flame className="w-5 h-5" style={{ color: rawColors.app.orange }} />
        Quick Insights
      </h2>

      <InsightRow
        icon={Sun}
        label="Best Month (lowest spend)"
        value={stats.bestMonth}
        color={rawColors.app.green}
      />
      <InsightRow
        icon={Moon}
        label="Worst Month (highest spend)"
        value={stats.worstMonth}
        color={rawColors.app.red}
      />
      <InsightRow
        icon={Flame}
        label="Longest no-spend streak"
        value={`${stats.maxStreak} days`}
        color={rawColors.app.orange}
      />
      <InsightRow
        icon={TrendingDown}
        label="Biggest spending day"
        value={
          stats.biggestExpenseDay.date
            ? `${formatCurrencyCompact(stats.biggestExpenseDay.amount)}`
            : 'N/A'
        }
        subtitle={
          stats.biggestExpenseDay.date ? formatDayLabel(stats.biggestExpenseDay.date) : undefined
        }
        color={rawColors.app.red}
      />
      <InsightRow
        icon={TrendingUp}
        label="Biggest earning day"
        value={
          stats.biggestIncomeDay.date
            ? `${formatCurrencyCompact(stats.biggestIncomeDay.amount)}`
            : 'N/A'
        }
        subtitle={
          stats.biggestIncomeDay.date ? formatDayLabel(stats.biggestIncomeDay.date) : undefined
        }
        color={rawColors.app.green}
      />
      <InsightRow
        icon={BarChart3}
        label="Days with expenses"
        value={`${stats.daysWithExpense} of ${stats.elapsedDays}`}
        subtitle={
          stats.elapsedDays > 0
            ? `${Math.round((stats.daysWithExpense / stats.elapsedDays) * 100)}% of days`
            : undefined
        }
        color={rawColors.app.blue}
      />

      {stats.maxStreak > 0 && (
        <div className="pt-3 mt-3 border-t border-border">
          <p className="text-xs text-text-tertiary mb-2">No-Spend Streak Record</p>
          <div className="flex items-baseline gap-2">
            <span
              className="text-2xl font-bold tabular-nums"
              style={{ color: getStreakColor(stats.maxStreak) }}
            >
              {stats.maxStreak}
            </span>
            <span className="text-sm text-text-tertiary">days in a row</span>
          </div>
          {/* Single accent bar -- streak length relative to a 30-day mark
              (replaces 30 identical dots that redundantly encoded one number). */}
          <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--overlay-3)] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, (stats.maxStreak / 30) * 100)}%`,
                backgroundColor: getStreakColor(stats.maxStreak),
              }}
            />
          </div>
        </div>
      )}

      <div className="pt-3 mt-3 border-t border-border">
        <p className="text-xs text-text-tertiary mb-1">Total Savings</p>
        <p
          className={`text-xl font-bold ${stats.totalSavings >= 0 ? 'text-app-green' : 'text-app-red'}`}
        >
          {stats.totalSavings >= 0 ? '+' : ''}
          {formatCurrencyCompact(stats.totalSavings)}
        </p>
      </div>
    </motion.div>
  )
}
