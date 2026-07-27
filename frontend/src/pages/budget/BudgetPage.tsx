import { useMemo, useState } from 'react'

import { motion } from 'motion/react'
import { AlertTriangle, PiggyBank, ShoppingBag, Target } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import PageErrorState from '@/components/shared/PageErrorState'
import LoadingSkeleton from '@/components/shared/LoadingSkeleton'
import { Money, PageContainer, PageHeader } from '@/components/ui'
import { fadeUpItem, staggerContainer } from '@/constants/animations'
import { useDataDateRange } from '@/hooks/api/useAnalytics'
import { useSpendingRule } from '@/hooks/api/useAnalyticsV2'
import type { SpendingBucket, SpendingRuleResponse } from '@/services/api/analyticsV2'
import { formatCurrency, formatPercent } from '@/lib/formatters'

import { BucketCard } from './components/BucketCard'
import { CategoryTable } from './components/CategoryTable'
import { PeriodPicker, type PresetPeriod } from './components/PeriodPicker'
import { toPeriodRange } from './budgetUtils'

/**
 * /budgets -- the 50/30/20 Budget Rule page.
 *
 * Header cards show Needs / Wants / Savings actuals vs targets from
 * `user_preferences.{needs,wants,savings}_target_percent`. The table below
 * breaks down every category the user spent on in the selected period,
 * grouped by bucket, with monthly-average calculated over the period length.
 *
 * The bucket model follows Elizabeth Warren's *All Your Worth* for Needs and
 * Wants. Savings is the NET CHANGE IN THE INVESTMENT PERIMETER (allocations into
 * SIP/PPF/EPF/NPS/stocks, minus redemptions out of them) -- the header card and
 * the table's Savings rows are the same number, deliberately.
 *
 * It is NOT income minus expenses. Money that merely stayed in a bank account
 * was never allocated to anything, so counting it as saved reported an intention
 * as an outcome. The residual now has its own name, `unallocated_amount`, so the
 * three buckets plus unallocated add up to income exactly.
 */
export default function BudgetPage() {
  const [period, setPeriod] = useState<PresetPeriod>('last_12_months')
  const [customStart, setCustomStart] = useState<string>('')
  const [customEnd, setCustomEnd] = useState<string>('')
  const dateRangeQuery = useDataDateRange()
  const { minDate, maxDate } = dateRangeQuery

  const range = useMemo(
    () => toPeriodRange(period, { customStart, customEnd, minDate, maxDate }),
    [period, customStart, customEnd, minDate, maxDate],
  )

  const spendingRuleQuery = useSpendingRule({
    start_date: range.start,
    end_date: range.end,
  })
  const { data } = spendingRuleQuery

  if (dateRangeQuery.isError || spendingRuleQuery.isError) {
    const retryBudget = () => {
      void dateRangeQuery.refetch()
      void spendingRuleQuery.refetch()
    }
    return (
      <PageErrorState
        title="50/30/20 Budget Rule"
        subtitle="Actual split of your income across Needs, Wants, and Savings"
        onRetry={retryBudget}
      />
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="50/30/20 Budget Rule"
        subtitle="Actual split of your income across Needs, Wants, and Savings"
        action={
          <PeriodPicker
            value={period}
            onChange={setPeriod}
            customStart={customStart}
            customEnd={customEnd}
            onCustomChange={(s, e) => {
              setCustomStart(s)
              setCustomEnd(e)
            }}
            minDate={minDate}
            maxDate={maxDate}
          />
        }
      />

      {renderBody(dateRangeQuery.isLoading || spendingRuleQuery.isLoading, data)}
    </PageContainer>
  )
}

function renderBody(isLoading: boolean, data: SpendingRuleResponse | undefined) {
  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <LoadingSkeleton className="h-52" />
          <LoadingSkeleton className="h-52" />
          <LoadingSkeleton className="h-52" />
        </div>
        <LoadingSkeleton className="h-96" />
      </div>
    )
  }
  // Defensive: some upstream (demo adapter, cached wrong shape, etc.) could
  // feed us an object without the expected keys. Fail soft rather than crash.
  if (!data.period || !data.buckets) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Unexpected response shape"
        description="The budget rule endpoint returned data in an unexpected format. Try refreshing the page."
        variant="card"
      />
    )
  }
  return <BudgetRuleContent data={data} />
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
      // The caption has to state the definition, because the intuitive reading
      // (income minus expenses) is a DIFFERENT and larger number: on the real
      // ledger for FY2025-26 the perimeter change is 578,428.79 while income
      // minus expenses is 1,182,355.68. Whatever stayed in the bank shows up as
      // Unallocated instead.
      //
      // It also has to state WHICH target the floor is, because the Expense
      // Analysis page shows a Savings card too, on the income-minus-expenses
      // numerator against `savings_goal_percent`. This bucket is scored against
      // `savings_target_percent` (the 50/30/20 leg). Same word, two bars: a
      // reader comparing the two pages needs each card to say which is which.
      description: 'Net moved into investments, vs Spending Rule target',
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

      {/* The residual. Without it the three cards below visibly fail to add to
          100% of income and the user has no name for the gap -- whatever was
          neither spent nor moved into the investment perimeter. */}
      {hasIncome && (
        <motion.div variants={fadeUpItem}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 glass rounded-2xl border border-border px-4 py-3 text-sm">
            <div className="text-muted-foreground">
              <span className="font-medium text-foreground">Unallocated</span>
              {' -- income that stayed put: neither spent nor invested'}
            </div>
            <div className="flex items-baseline gap-2">
              <Money value={data.unallocated_amount} width="md" bold />
              <span className="text-muted-foreground">
                {formatPercent(data.unallocated_pct_of_income)} of income
              </span>
            </div>
          </div>
        </motion.div>
      )}

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
        <CategoryTable rows={data.categories} months={data.period.months} />
      </motion.div>
    </motion.div>
  )
}

function formatDateShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
