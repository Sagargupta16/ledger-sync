import { useMemo, useState } from 'react'

import ErrorState from '@/components/shared/ErrorState'
import { StickyToolbar } from '@/components/ui'
import { useDataDateRange } from '@/hooks/api/useAnalytics'
import { useSpendingRule } from '@/hooks/api/useAnalyticsV2'

import { toPeriodRange } from '../budgetUtils'
import { BudgetRuleBody } from './BudgetRuleContent'
import { PeriodPicker, type PresetPeriod } from './PeriodPicker'

/**
 * The 50/30/20 half of /budgets: its heading, the period picker and the split.
 *
 * A fragment, not a wrapper: the StickyToolbar must stay a direct child of the
 * page column to pin, so it sticks once scrolled to and only over the split it
 * filters. A load failure stays inside this half, leaving the category budgets
 * above it usable.
 */
export function BudgetRuleSection() {
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

  const retryBudgetRule = () => {
    void dateRangeQuery.refetch()
    void spendingRuleQuery.refetch()
  }

  return (
    <>
      <div className="border-t border-[var(--hairline-2)] pt-5">
        <h2 className="text-base font-semibold text-foreground">50/30/20 rule</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Actual split of your income across Needs, Wants, and Savings
        </p>
      </div>

      <StickyToolbar label="Budget rule period">
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
      </StickyToolbar>

      {dateRangeQuery.isError || spendingRuleQuery.isError ? (
        <ErrorState
          title="Unable to load the 50/30/20 rule"
          message="We could not load this financial data. Your saved records are unchanged. Try again."
          onRetry={retryBudgetRule}
          errorType="network"
          variant="card"
        />
      ) : (
        <BudgetRuleBody
          isLoading={dateRangeQuery.isLoading || spendingRuleQuery.isLoading}
          data={spendingRuleQuery.data}
        />
      )}
    </>
  )
}
