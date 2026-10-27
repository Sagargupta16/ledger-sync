import { PageContainer, PageHeader } from '@/components/ui'

import { BudgetRuleSection } from './components/BudgetRuleSection'
import { CategoryBudgets } from './components/CategoryBudgets'

/**
 * /budgets -- category budgets, then the 50/30/20 rule.
 *
 * Category budgets are monthly limits per expense category, tracked against the
 * current IST month (the endpoint counts the month's spend each time the list
 * loads, so it never waits for an analytics refresh). They come first because the
 * navigation badges and Overview's "Budgets at risk" panel send readers here.
 *
 * In the 50/30/20 half, header cards show Needs / Wants / Savings actuals vs targets from
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
  return (
    <PageContainer>
      <PageHeader
        title="Budgets"
        subtitle="Monthly limits per spending category, and how your income splits across Needs, Wants, and Savings"
      />
      <CategoryBudgets />
      <BudgetRuleSection />
    </PageContainer>
  )
}
