import {
  ArrowDownCircle,
  ArrowUpCircle,
  Hash,
  PowerOff,
  TrendingUp,
} from 'lucide-react'

import { CardGridSkeleton } from '@/components/shared/LoadingSkeleton'
import SummaryCard from '@/components/shared/SummaryCard'
import { DataTable, Money, type DataTableColumn } from '@/components/ui'
import { formatCurrency, formatCurrencyCompact } from '@/lib/formatters'

import type { RecurringSummary } from '../types'

interface FreshnessRow {
  readonly label: string
  readonly subtotal: RecurringSummary['current']
}

const FRESHNESS_COLUMNS: readonly DataTableColumn<FreshnessRow>[] = [
  {
    key: 'label',
    header: 'Included in totals',
    mobilePrimary: true,
    cell: ({ label, subtotal }) => (
      <span className="text-xs font-medium text-foreground">
        <span className="block">{label}</span>
        <span className="mt-0.5 block font-normal text-text-tertiary">{subtotal.count} items</span>
      </span>
    ),
  },
  {
    key: 'expense',
    header: 'Expense/mo',
    align: 'right',
    cell: ({ subtotal }) => <Money value={subtotal.monthlyExpense} className="text-xs" />,
  },
  {
    key: 'income',
    header: 'Income/mo',
    align: 'right',
    cell: ({ subtotal }) => <Money value={subtotal.monthlyIncome} className="text-xs" />,
  },
]

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
  const freshnessRows = [
    { label: 'Confirmed or recent', subtotal: summary.current },
    { label: 'Needs review', subtotal: summary.needsReview },
  ]
  if (summary.unassessed.count > 0) {
    freshnessRows.push({ label: 'Date or frequency unavailable', subtotal: summary.unassessed })
  }

  return (
    <>
      <div
        className={`grid grid-cols-2 gap-3 sm:gap-5 ${
          summary.pausedExpenseCount > 0 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
        }`}
      >
        <SummaryCard
          icon={ArrowDownCircle}
          label="Monthly Expense"
          value={formatCurrencyCompact(summary.monthlyExpense)}
          colorClass="text-app-red"
          bgClass="bg-app-red/20"
          delay={0}
          compact
        />
        <SummaryCard
          icon={ArrowUpCircle}
          label="Monthly Income"
          value={formatCurrencyCompact(summary.monthlyIncome)}
          colorClass="text-app-green"
          bgClass="bg-app-green/20"
          delay={0.04}
          compact
        />
        <SummaryCard
          icon={TrendingUp}
          label="Net Monthly"
          value={formatCurrencyCompact(summary.netMonthly)}
          colorClass={summary.netMonthly >= 0 ? 'text-app-green' : 'text-app-red'}
          bgClass={summary.netMonthly >= 0 ? 'bg-app-green/20' : 'bg-app-red/20'}
          delay={0.08}
          compact
        />
        <SummaryCard
          icon={Hash}
          label="Active Recurring"
          value={`${summary.count}`}
          colorClass="text-app-blue"
          bgClass="bg-app-blue/20"
          delay={0.12}
          compact
        />
        {summary.pausedExpenseCount > 0 && (
          <SummaryCard
            icon={PowerOff}
            label={`Paused expenses (${summary.pausedExpenseCount})`}
            value={formatCurrencyCompact(summary.pausedMonthlyExpense)}
            colorClass="text-app-purple"
            bgClass="bg-app-purple/20"
            delay={0.16}
            compact
          />
        )}
      </div>

      {(summary.needsReview.count > 0 || summary.unassessed.count > 0) && (
        <section className="ledger-panel space-y-3 p-4">
          <div className="space-y-1">
            <h2 className="text-sm font-medium text-foreground">Commitment freshness</h2>
            <p className="text-xs text-muted-foreground">
              Every active commitment stays in the totals. Review older detections to confirm whether they still recur.
            </p>
          </div>
          <DataTable
            columns={FRESHNESS_COLUMNS}
            rows={freshnessRows}
            rowKey={(row) => row.label}
            ariaLabel="Monthly commitment estimates by freshness"
            mobileCards
          />
        </section>
      )}

      {hasActiveItems && totalMix > 0 && (
        <section className="ledger-panel space-y-3 p-4">
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
              className="h-full bg-app-green"
              style={{ width: `${incomeShare}%` }}
            />
            <span
              className="h-full bg-app-red"
              style={{ width: `${expenseShare}%` }}
            />
          </div>

          <div className="flex flex-col gap-1.5 text-[11px] text-text-tertiary sm:flex-row sm:items-center sm:gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-app-green" />
              <span>Income {formatCurrency(summary.monthlyIncome)}/mo</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-app-red" />
              <span>Expense {formatCurrency(summary.monthlyExpense)}/mo</span>
            </span>
          </div>
        </section>
      )}
    </>
  )
}
