/**
 * The ONE savings-rate definition for the whole app.
 *
 * Decision (2026-07-27): savings rate = (income - expense) / income for the
 * period, expressed as a percentage. Nothing else.
 *
 * Why this and not the alternatives:
 *
 * - **Denominator is gross period income, not average monthly income.**
 *   `(avgIncome - avgExpense) / avgIncome` is algebraically identical to the
 *   pooled ratio ONLY when both averages use the same month count, which is
 *   easy to break and impossible to audit. Pooling the raw sums is the same
 *   number with one fewer way to be wrong, and it matches the backend
 *   `/api/calculations/totals` contract that the Dashboard KPI already reads.
 *
 * - **Transfers are never income and never expense.** Moving money from a bank
 *   account into a mutual fund / PPF / NPS account is a change of asset form,
 *   not consumption, so an investment contribution stays inside the numerator
 *   as savings. Counting it as an outflow would report a saver who invests
 *   everything as having a ~0% savings rate. Every TRANSFER row is therefore
 *   excluded from both sides -- consistent with BEA's national accounting,
 *   where personal saving is disposable income less *outlays* and asset
 *   purchases are not outlays (https://www.bea.gov/data/income-saving/personal-saving-rate).
 *
 * - **The in-progress current month is excluded from any multi-period figure.**
 *   Salary lands once a month but rent/bills accrue daily, so a month observed
 *   on day 5 is nearly all outflow. On the real ledger the partial month reads
 *   -696.8%, which drags a 91-month average down by 1.6 percentage points.
 *   A day-of-month heuristic ("drop it only before the 15th") makes the same
 *   ledger report two different savings rates depending on when you open the
 *   app; that is not a rounding difference, it is two answers. "In progress"
 *   means exactly what `dateUtils.isPartialMonth` means -- see
 *   {@link isCompleteMonth}, which delegates to it rather than re-deciding.
 *
 * - **Zero income yields `null`, not `0`.** "No income recorded" and "saved
 *   nothing" are different facts. Callers that must render a number opt into a
 *   fallback explicitly via {@link savingsRatePercentOr}.
 *
 * WHAT COUNTS AS EXPENSE (read this before adding a caller)
 * --------------------------------------------------------
 * This module divides the two numbers it is handed; it does not decide which
 * rows they came from. The zone-wide rule for the EXPENSE SIDE is: a realised
 * capital loss booked as an EXPENSE row is not consumption, so it is excluded
 * from `expense`. Frontend callers get that by filtering with `isSpending` from
 * `lib/expenseClassification` (health analysis, period comparison, category
 * breakdown, the demo totals); the backend gets it from `expense_sum_col(...,
 * loss_keys=...)`. Both land on the same `total_expenses`.
 *
 * TWO RATES, TWO QUESTIONS (verified against the backend, 2026-07-27)
 * ------------------------------------------------------------------
 * Agreeing on the expense side does NOT make every rate in the app one number,
 * and the earlier version of this docstring was wrong to claim it did. It
 * asserted that `/api/calculations/totals` excludes losses "from `total_expenses`
 * and from `savings_rate`". It does not. `_totals_payload`
 * (`backend/src/ledger_sync/api/calculations.py:142-148`) is:
 *
 *     net_savings  = total_income - total_expenses - capital_losses
 *     savings_rate = net_savings / total_income * 100
 *
 * so the loss is subtracted out of `net_savings` and therefore IS carried by
 * `savings_rate`. Running that arithmetic on 600000 income / 240000 rent /
 * 120000 realised loss gives `savings_rate` 40, and it gives 40 for a
 * classified user AND for a default user whose `capital_loss_keys_for` set is
 * empty (then `total_expenses` is 360000 and `capital_losses` is 0). The
 * published rate is deliberately INVARIANT to whether the user has classified
 * anything, which is the point the backend comment in
 * `core/analytics/summaries.py:77-88` makes: redefining it would silently step a
 * persisted historical column upward the moment someone classified a category.
 *
 * So there are two legitimately different questions, and they must keep
 * different names:
 *
 * - **Wealth-change rate** = `net_savings / income`, the loss included. This is
 *   what the `savings_rate` FIELD on `TotalsData` / `KPIData` means. Anything
 *   mocking or mirroring those payloads must reproduce it, which is why
 *   `generateDemoTotals` routes through {@link savingsRatePercentFromNet}.
 * - **Consumption rate** = `(income - spending) / income`, the loss excluded
 *   from both sides. This is what the health panel's savings-rate metric, the
 *   period-comparison table and the category surfaces mean, and it is the
 *   complement of the backend's own `expense_ratio` (named for exactly this
 *   question, and it excludes the loss because `total_expenses` does).
 *
 * On the ledger above the first is 40% and the second is 60%. That 20-point gap
 * is a real difference in meaning, not drift. Do NOT "reconcile" them by
 * changing one number to match the other: pick the one whose question the caller
 * is asking, and keep the field name that goes with it.
 *
 * TWO NUMERATORS NEED TWO TARGETS (decided 2026-07-27)
 * ---------------------------------------------------
 * A separate numerator is {@link investmentAllocationRatePercent} below -- money
 * moved INTO instruments, which the /budgets Savings bucket reports. Keeping the
 * numerators apart is only half the job: a TARGET scored against them has to be
 * split the same way, because "20% of income" is a much harder bar on
 * allocations than on income-minus-expenses. On the real ledger for FY2025-26 the
 * perimeter change is 578,428.79 against 1,182,355.68 of leftover income,
 * roughly 2x, so one 20% floor made /budgets read "under target" while
 * /spending-analysis read "on track" for the same user in the same period.
 *
 * `user_preferences` therefore assigns one preference per numerator:
 *
 * - `savings_target_percent` -- the 50/30/20 Savings leg, scored ONLY against
 *   the allocation numerator (`api/analytics_v2_impl/spending_rule.py`, /budgets).
 * - `savings_goal_percent` -- scored ONLY against income minus expenses: the
 *   /spending-analysis Savings card, the Financial Health "Spend Less Than
 *   Income" metric, and the Trends cumulative-savings-rate goal line.
 *
 * Both default to 20.0, which is why the mismatch was silent. When adding a
 * surface that scores a savings figure, pick the preference that matches your
 * numerator; do not reach for whichever one is already imported.
 */

import { isPartialMonth } from '@/lib/dateUtils'

/** One period's income/expense pair. Both are positive magnitudes. */
export interface PeriodFlows {
  income: number
  expense: number
}

/** Net savings for a period. Transfers are excluded by construction. */
export function netSavings(flows: PeriodFlows): number {
  return flows.income - flows.expense
}

/**
 * Savings rate as a percentage, or `null` when there is no income to divide by.
 * Negative results are meaningful (spent more than earned) and are NOT clamped.
 */
export function savingsRatePercent(flows: PeriodFlows): number | null {
  if (flows.income <= 0) return null
  return (netSavings(flows) / flows.income) * 100
}

/**
 * Savings rate as a percentage with an explicit fallback for the no-income
 * case. Use only where the UI cannot represent "not applicable".
 */
export function savingsRatePercentOr(flows: PeriodFlows, fallback = 0): number {
  return savingsRatePercent(flows) ?? fallback
}

/**
 * Same definition as {@link savingsRatePercent}, for callers that carry the net
 * figure rather than the expense figure (FIRE annual savings, the tax summary
 * tile, the Sankey where net = income - expenses - tax). It is a re-expression,
 * NOT a second definition: `expense` is recovered as `income - net`, so both
 * routes divide the same numerator by the same denominator.
 */
export function savingsRatePercentFromNet(net: number, income: number): number | null {
  return savingsRatePercent({ income, expense: income - net })
}

/**
 * Share of period income taken by one flow, as a percentage.
 *
 * NOT a savings rate: the numerator is a single flow (essentials, debt service,
 * a category), not `income - expense`. Kept here so the zero-income branch is
 * decided in one place, and so the `fallback` is a deliberate choice at each
 * call site: the essential-expense ratio wants 100 (with no income, essentials
 * consume everything) while debt service wants 0.
 */
export function shareOfIncomePercent(flow: number, income: number, fallback = 0): number {
  if (income <= 0) return fallback
  return (flow / income) * 100
}

/**
 * Allocation into the investment perimeter as a share of income.
 *
 * DELIBERATELY DIFFERENT from the savings rate. Savings rate asks "how much of
 * income was not consumed"; this asks "how much of income was moved into
 * investment accounts". A saver who parks a surplus in a bank account scores
 * high on the first and zero on this one. Transfers into investment accounts
 * are the numerator here even though {@link savingsRatePercent} excludes every
 * transfer from both of its sides -- that is the point of having two names.
 *
 * `netInvestmentFlow` is inflow minus withdrawals, so it can be negative (a net
 * withdrawal year) and is not clamped.
 */
export function investmentAllocationRatePercent(
  netInvestmentFlow: number,
  income: number,
  fallback = 0,
): number {
  return shareOfIncomePercent(netInvestmentFlow, income, fallback)
}

/**
 * Pool several periods into one income/expense pair. Use this whenever a caller
 * needs period totals: reconstituting them as `avgMonthly * monthCount` is only
 * equal while both averages use the identical divisor, and it is not even
 * exactly equal then -- `(1111.11 + 2222.22 + 99999.9) / 3 * 3` is
 * 103333.22999999998, not 103333.23.
 */
export function sumFlows(periods: readonly PeriodFlows[]): PeriodFlows {
  return periods.reduce<PeriodFlows>(
    (acc, p) => ({ income: acc.income + p.income, expense: acc.expense + p.expense }),
    { income: 0, expense: 0 },
  )
}

/**
 * Pooled savings rate across several periods: sum the numerators and sum the
 * denominators, never average the per-period rates. Averaging rates weights a
 * Rs 500 stipend month the same as a Rs 2,50,000 salary month -- on the real
 * ledger that turns a true +37.3% into -92.3%.
 */
export function pooledSavingsRatePercent(periods: readonly PeriodFlows[]): number | null {
  return savingsRatePercent(sumFlows(periods))
}

/** Current calendar month as a "YYYY-MM" key, in LOCAL time. */
export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * True when a "YYYY-MM" key is a finished calendar month.
 *
 * Delegates the "is this month still in progress" question to
 * {@link isPartialMonth} instead of answering it again. A bare
 * `key < currentMonthKey(now)` looks equivalent and is not: on the LAST day of
 * a month every calendar day already exists, so `dateUtils` deliberately calls
 * that month complete (see the carve-out in `getMonthProgress`). Re-deciding it
 * here made the health panel drop a whole finished month on the 31st while
 * `useTrendsForecasts` / `useNetWorth` / `useIncomeAnalysis` /
 * `useAnalyticsTimeFilter` kept it -- the same day-of-month instability the
 * 15th-of-the-month heuristic caused, moved to a different day.
 *
 * Future months are not complete either: a scheduled row dated next year has
 * not happened, and `isPartialMonth` reports `false` for it (nothing is in
 * progress), so the future case needs its own branch.
 */
export function isCompleteMonth(monthKey: string, now: Date = new Date()): boolean {
  const month = monthKey.slice(0, 7)
  if (month > currentMonthKey(now)) return false
  return !isPartialMonth(month, now)
}

/**
 * Drop every "YYYY-MM" key that is not a finished month: the month in progress
 * and anything after it (future-dated scheduled rows produce those).
 *
 * Order-independent on purpose. Removing "the last element" assumed the current
 * month sorts last, which a single future-dated row falsifies -- that dropped
 * the wrong month and left a dangling key behind.
 */
export function completeMonthKeys(monthKeys: readonly string[], now: Date = new Date()): string[] {
  return monthKeys.filter((key) => isCompleteMonth(key, now))
}
