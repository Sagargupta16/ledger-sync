import {
  ArrowDownCircle,
  ArrowUpCircle,
  Hash,
  PowerOff,
  TrendingUp,
} from 'lucide-react'

import { CardGridSkeleton } from '@/components/shared/LoadingSkeleton'
import SummaryCard from '@/components/shared/SummaryCard'
import { formatCurrency } from '@/lib/formatters'

import type { RecurringSummary } from '../types'

interface RecurringSummarySectionProps {
  readonly isLoading: boolean
  readonly summary: RecurringSummary
  readonly hasActiveItems: boolean
}

export default function RecurringSummarySection({
  isLoading,
  summary,
  hasActiveItems,
}: RecurringSummarySectionProps) {
  if (isLoading) {
    return <CardGridSkeleton count={4} cols="grid-cols-2 lg:grid-cols-4" />
  }

  const totalMix = summary.monthlyIncome + summary.monthlyExpense
  const incomeShare = totalMix > 0 ? (summary.monthlyIncome / totalMix) * 100 : 0
  const expenseShare = totalMix > 0 ? (summary.monthlyExpense / totalMix) * 100 : 0

  return (
    <>
      <div
        className={`grid grid-cols-2 gap-3 sm:gap-5 ${
          summary.deactivatedCount > 0 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
        }`}
      >
        <SummaryCard
          icon={ArrowDownCircle}
          label="Monthly Expense"
          value={formatCurrency(summary.monthlyExpense)}
          colorClass="text-app-red"
          bgClass="bg-app-red/20"
          shadowClass="shadow-app-red/30"
          delay={0.1}
          compact
        />
        <SummaryCard
          icon={ArrowUpCircle}
          label="Monthly Income"
          value={formatCurrency(summary.monthlyIncome)}
          colorClass="text-app-green"
          bgClass="bg-app-green/20"
          shadowClass="shadow-app-green/30"
          delay={0.2}
          compact
        />
        <SummaryCard
          icon={TrendingUp}
          label="Net Monthly"
          value={formatCurrency(summary.netMonthly)}
          colorClass={summary.netMonthly >= 0 ? 'text-app-green' : 'text-app-red'}
          bgClass={summary.netMonthly >= 0 ? 'bg-app-green/20' : 'bg-app-red/20'}
          shadowClass={
            summary.netMonthly >= 0 ? 'shadow-app-green/30' : 'shadow-app-red/30'
          }
          delay={0.3}
          compact
        />
        <SummaryCard
          icon={Hash}
          label="Active Recurring"
          value={`${summary.count}`}
          colorClass="text-app-blue"
          bgClass="bg-app-blue/20"
          shadowClass="shadow-app-blue/30"
          delay={0.4}
          compact
        />
        {summary.deactivatedCount > 0 && (
          <SummaryCard
            icon={PowerOff}
            label={`Saved / mo (${summary.deactivatedCount} cancelled)`}
            value={formatCurrency(summary.deactivatedExpenseSavings)}
            colorClass="text-app-purple"
            bgClass="bg-app-purple/20"
            shadowClass="shadow-app-purple/30"
            delay={0.5}
            compact
          />
        )}
      </div>

      {hasActiveItems && totalMix > 0 && (
        <section className="glass space-y-3 rounded-xl border border-border p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-medium text-foreground">Recurring mix</h2>
            {summary.monthlyIncome > 0 && (
              <p className="text-xs text-text-tertiary">
                Fixed expenses use{' '}
                <span
                  className={
                    summary.monthlyExpense > summary.monthlyIncome
                      ? 'text-app-red'
                      : 'text-foreground'
                  }
                >
                  {Math.round((summary.monthlyExpense / summary.monthlyIncome) * 100)}%
                </span>{' '}
                of recurring income
              </p>
            )}
          </div>

          <div
            className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--overlay-3)]"
            role="img"
            aria-label={`${formatCurrency(summary.monthlyIncome)} recurring income and ${formatCurrency(summary.monthlyExpense)} recurring expenses per month`}
          >
            <span
              className="h-full bg-app-green transition-[width] duration-500"
              style={{ width: `${incomeShare}%` }}
            />
            <span
              className="h-full bg-app-red transition-[width] duration-500"
              style={{ width: `${expenseShare}%` }}
            />
          </div>

          <div className="flex flex-col gap-1.5 text-[11px] text-text-tertiary sm:flex-row sm:items-center sm:gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-app-green" />
              Income {formatCurrency(summary.monthlyIncome)}/mo
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-app-red" />
              Expense {formatCurrency(summary.monthlyExpense)}/mo
            </span>
          </div>
        </section>
      )}
    </>
  )
}
