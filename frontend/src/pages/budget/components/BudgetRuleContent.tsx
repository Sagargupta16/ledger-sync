import { motion } from 'motion/react'
import { AlertTriangle, PiggyBank, ShoppingBag, Target } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import LoadingSkeleton from '@/components/shared/LoadingSkeleton'
import { fadeUpItem, staggerContainer } from '@/constants/animations'
import type { SpendingBucket, SpendingRuleResponse } from '@/services/api/analyticsV2'
import { formatCurrency, formatDate, formatPercent } from '@/lib/formatters'

import { BucketCard } from './BucketCard'
import { CategoryTable } from './CategoryTable'

/**
 * The 50/30/20 split for the selected period: summary band, the three bucket
 * cards and the grouped category table. See `BudgetPage` for the bucket model.
 */
export function BudgetRuleBody({
  isLoading,
  data,
}: {
  readonly isLoading: boolean
  readonly data: SpendingRuleResponse | undefined
}) {
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
      className="space-y-6"
    >
      <motion.div variants={fadeUpItem}>
        <dl className="ledger-band grid-cols-2 lg:grid-cols-4">
          <div className="ledger-cell col-span-2 p-3 lg:col-span-1">
            <dt className="ledger-meta text-text-tertiary">Period</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {formatDateShort(data.period.start)} to {formatDateShort(data.period.end)}
            </dd>
            <dd className="mt-0.5 text-xs text-text-tertiary">
              {completeMonthsLabel(data.period.months)}
            </dd>
          </div>
          <div className="ledger-cell p-3">
            <dt className="ledger-meta text-text-tertiary">Income</dt>
            <dd className="ledger-figure mt-1 whitespace-nowrap text-sm font-semibold text-foreground">
              {formatCurrency(data.income_total)}
            </dd>
          </div>
          <div className="ledger-cell p-3">
            <dt className="ledger-meta text-text-tertiary">Expenses</dt>
            <dd className="ledger-figure mt-1 whitespace-nowrap text-sm font-semibold text-foreground">
              {formatCurrency(data.expense_total)}
            </dd>
          </div>
          {hasIncome && (
            <div className="ledger-cell col-span-2 p-3 lg:col-span-1">
              <dt className="ledger-meta text-text-tertiary">Unallocated</dt>
              <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="ledger-figure whitespace-nowrap text-sm font-semibold text-foreground">
                  {formatCurrency(data.unallocated_amount)}
                </span>
                <span className="text-xs text-text-tertiary">
                  {formatPercent(data.unallocated_pct_of_income)} of income
                </span>
              </dd>
              <dd className="mt-0.5 text-xs text-text-tertiary">
                Stayed in cash: neither spent nor invested
              </dd>
            </div>
          )}
        </dl>
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
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
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

// The period bounds are `YYYY-MM-DD` calendar days; the string form keeps the
// day where `new Date(iso)` read it as UTC midnight.
function formatDateShort(iso: string): string {
  return formatDate(iso, { day: 'numeric', month: 'short', year: 'numeric' })
}

// Averages use complete months only, so a range inside the current month has
// none yet -- say so instead of "0 months".
function completeMonthsLabel(months: number): string {
  if (months === 0) return 'Current month in progress'
  return `${months} complete ${months === 1 ? 'month' : 'months'}`
}
