import { useMemo, useState } from 'react'

import { motion } from 'framer-motion'
import { AlertTriangle, PiggyBank, ShoppingBag, Target } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import LoadingSkeleton from '@/components/shared/LoadingSkeleton'
import { PageContainer, PageHeader } from '@/components/ui'
import { fadeUpItem, staggerContainer } from '@/constants/animations'
import { useSpendingRule } from '@/hooks/api/useAnalyticsV2'
import type { SpendingBucket, SpendingRuleResponse } from '@/services/api/analyticsV2'
import { formatCurrency } from '@/lib/formatters'

import { BucketCard } from './components/BucketCard'
import { CategoryTable } from './components/CategoryTable'
import { PeriodPicker, type PresetPeriod } from './components/PeriodPicker'
import { toPeriodRange } from './budgetUtils'

/**
 * /budgets — the 50/30/20 Budget Rule page.
 *
 * Header cards show Needs / Wants / Savings actuals vs targets from
 * `user_preferences.{needs,wants,savings}_target_percent`. The table below
 * breaks down every category the user spent on in the selected period,
 * grouped by bucket, with monthly-average calculated over the period length.
 *
 * The visual model follows Elizabeth Warren's *All Your Worth*: savings is
 * income - expenses (the header savings card), while the table's Savings rows
 * show what actually landed in investment accounts (SIP, PPF, EPF, etc.).
 */
export default function BudgetPage() {
  const [period, setPeriod] = useState<PresetPeriod>('last_12_months')
  const range = useMemo(() => toPeriodRange(period), [period])

  const { data, isLoading, isError } = useSpendingRule({
    start_date: range.start,
    end_date: range.end,
  })

  if (isError) {
    return (
      <PageContainer>
        <PageHeader
          title="Budget Rule"
          subtitle="Track your 50/30/20 split — Needs, Wants, Savings"
        />
        <EmptyState
          icon={AlertTriangle}
          title="Could not load budget rule"
          description="We hit an error fetching your spending data. Check your connection and try again."
          variant="card"
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="50/30/20 Budget Rule"
        subtitle="Actual split of your income across Needs, Wants, and Savings"
        action={<PeriodPicker value={period} onChange={setPeriod} />}
      />

      {isLoading || !data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <LoadingSkeleton className="h-52" />
            <LoadingSkeleton className="h-52" />
            <LoadingSkeleton className="h-52" />
          </div>
          <LoadingSkeleton className="h-96" />
        </div>
      ) : (
        <BudgetRuleContent data={data} />
      )}
    </PageContainer>
  )
}

function BudgetRuleContent({ data }: { readonly data: SpendingRuleResponse }) {
  const cards: Array<{
    readonly bucket: SpendingBucket
    readonly title: string
    readonly description: string
    readonly icon: typeof Target
    readonly kind: 'cap' | 'floor'
  }> = [
    {
      bucket: 'needs',
      title: 'Needs',
      description: 'Housing, Healthcare, Food, etc.',
      icon: Target,
      kind: 'cap',
    },
    {
      bucket: 'wants',
      title: 'Wants',
      description: 'Entertainment, Shopping, etc.',
      icon: ShoppingBag,
      kind: 'cap',
    },
    {
      bucket: 'savings',
      title: 'Savings',
      description: 'Income minus Expenses',
      icon: PiggyBank,
      kind: 'floor',
    },
  ]

  const hasIncome = data.income_total > 0

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Header stat: income + expenses + period summary */}
      <motion.div variants={fadeUpItem}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-muted-foreground">
          <div>
            Period: <span className="font-medium text-foreground">{formatDateShort(data.period.start)}</span>{' '}
            → <span className="font-medium text-foreground">{formatDateShort(data.period.end)}</span>{' '}
            ({data.period.months} {data.period.months === 1 ? 'month' : 'months'})
          </div>
          <div>
            Income: <span className="font-medium text-foreground">{formatCurrency(data.income_total)}</span>
            {'  ·  '}
            Expenses: <span className="font-medium text-foreground">{formatCurrency(data.expense_total)}</span>
          </div>
        </div>
      </motion.div>

      {!hasIncome && (
        <motion.div variants={fadeUpItem}>
          <EmptyState
            icon={AlertTriangle}
            title="No income in this period"
            description="The 50/30/20 rule is computed as a percentage of income. Widen the date range or add income transactions."
            variant="card"
          />
        </motion.div>
      )}

      {/* Three-card row */}
      <motion.div
        variants={fadeUpItem}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        {cards.map((card) => (
          <BucketCard
            key={card.bucket}
            bucket={card.bucket}
            title={card.title}
            description={card.description}
            icon={card.icon}
            kind={card.kind}
            amount={data.buckets[card.bucket].amount}
            pctOfIncome={data.buckets[card.bucket].pct_of_income}
            target={data.targets[card.bucket]}
            scoreDelta={data.buckets[card.bucket].score_delta}
            hasIncome={hasIncome}
          />
        ))}
      </motion.div>

      {/* Category breakdown table */}
      <motion.div variants={fadeUpItem}>
        <CategoryTable
          rows={data.categories}
          incomeTotal={data.income_total}
          months={data.period.months}
        />
      </motion.div>
    </motion.div>
  )
}

function formatDateShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
