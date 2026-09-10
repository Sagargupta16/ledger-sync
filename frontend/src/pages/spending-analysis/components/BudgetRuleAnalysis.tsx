import { motion } from 'motion/react'
import { PiggyBank, ShieldCheck, Sparkles } from 'lucide-react'
import { Pie, PieChart, Tooltip } from 'recharts'

import EmptyState from '@/components/shared/EmptyState'
import { chartDataTable } from '@/components/ui/chartDataTable'
import ChartTooltipContent from '@/components/ui/ChartTooltipContent'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import {
  ChartContainer,
  chartTooltipProps,
  currencyTooltipFormatter,
} from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { SCROLL_FADE_UP } from '@/constants/animations'
import { SPENDING_TYPE_COLORS } from '@/lib/preferencesUtils'
import { formatCurrency } from '@/lib/formatters'

import { SAVINGS_COLOR, type BudgetRuleMetrics } from '../spendingAnalysisUtils'
import { BudgetRuleCard } from './BudgetRuleCard'

interface SpendingBreakdown {
  essential: number
  discretionary: number
}

interface SpendingChartDatum {
  name: string
  value: number
  /** Slice colour; Recharts reads it off the datum, replacing `<Cell fill>`. */
  fill: string
}

interface BudgetRuleAnalysisProps {
  readonly needsTarget: number
  readonly wantsTarget: number
  /**
   * Floor for the SAVINGS card, from `savings_goal_percent` -- the
   * income-minus-expenses target. Not `savings_target_percent`, which is the
   * /budgets allocation floor scored against money moved into instruments; see
   * `useSpendingAnalysis` for the two numerators and why they keep separate
   * targets.
   */
  readonly savingsTarget: number
  readonly spendingChartData: SpendingChartDatum[]
  readonly spendingBreakdown: SpendingBreakdown | null
  readonly budgetRuleMetrics: BudgetRuleMetrics | null
  readonly savings: number
}

export default function BudgetRuleAnalysis({
  needsTarget,
  wantsTarget,
  savingsTarget,
  spendingChartData,
  spendingBreakdown,
  budgetRuleMetrics,
  savings,
}: BudgetRuleAnalysisProps) {
  const { animate } = useChartPresentation(spendingChartData.length)

  return (
    <motion.section
      className="ledger-panel p-4 sm:p-6"
      {...SCROLL_FADE_UP}
    >
      {/*
        The heading used to read `{needs}/{wants}/{savings} Budget Rule
        Analysis`. It cannot: the Savings floor now comes from
        `savings_goal_percent` while Needs/Wants come from the 50/30/20 triplet,
        so the three numbers are no longer guaranteed to sum to 100 and printing
        them slash-joined would advertise a rule they do not form. The two caps
        stay in the heading because they ARE two legs of that triplet; the floor
        moves into the caption next to the definition it is applied to.
      */}
      <p className="ledger-meta mb-2 text-app-blue">Allocation against your targets</p>
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        Budget Rule Analysis: Needs {needsTarget}% / Wants {wantsTarget}%
      </h2>
      <p className="mb-6 mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Needs and Wants are capped shares of income. The Savings floor of{' '}
        {savingsTarget}% is your Savings Goal, applied to income left after
        expenses. The Budget Rule page scores a separate target against money
        actually moved into investments, so the two savings figures differ by
        design.
      </p>

      {spendingChartData.length > 0 ? (
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] lg:gap-10">
          <div className="flex min-w-0 flex-col items-center gap-4">
            <div className="h-60 w-full max-w-72 sm:h-72">
              <ChartContainer ariaLabel="Donut showing your actual Needs, Wants, and Savings split of income">
                <PieChart>
                  <Pie
                    data={spendingChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius="66%"
                    outerRadius="90%"
                    dataKey="value"
                    strokeWidth={0}
                    paddingAngle={2}
                    isAnimationActive={animate}
                    animationDuration={700}
                    animationEasing="ease-out"
                  />
                  <Tooltip {...chartTooltipProps} content={<ChartTooltipContent />} formatter={currencyTooltipFormatter} />
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                    <tspan x="50%" dy="-5" fill={rawColors.text.primary} fontSize="14" fontWeight="600">
                      Actual split
                    </tspan>
                    <tspan x="50%" dy="20" fill={rawColors.text.tertiary} fontSize="12">
                      of income
                    </tspan>
                  </text>
                </PieChart>
              </ChartContainer>
            </div>

            <ul className="w-full max-w-72 divide-y divide-border/60" aria-label="Income allocation">
              {spendingChartData.map((item) => (
                <li key={item.name} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span
                      className="size-2 shrink-0 rounded-sm"
                      style={{ backgroundColor: item.fill }}
                      aria-hidden="true"
                    />
                    {item.name}
                  </span>
                  <span className="font-mono text-sm tabular-nums text-foreground">{formatCurrency(item.value)}</span>
                </li>
              ))}
            </ul>
            {chartDataTable(
              spendingChartData,
              [
                { header: 'Allocation', rowHeader: true, value: (row) => row.name },
                { header: 'Amount', value: (row) => formatCurrency(row.value) },
              ],
              'Needs, wants, and savings allocation',
              (row) => row.name,
            )}
          </div>

          <div className="min-w-0">
            <BudgetRuleCard
              title={`Needs (${needsTarget}%)`}
              subtitle="Housing, Healthcare, Food, etc."
              icon={ShieldCheck}
              value={spendingBreakdown?.essential ?? 0}
              percent={budgetRuleMetrics?.essentialPercent ?? 0}
              target={`\u2264${needsTarget}%`}
              targetPercent={needsTarget}
              isOverBudget={budgetRuleMetrics?.isOverspendingEssential ?? false}
              accentColor={SPENDING_TYPE_COLORS.essential}
              bgClass="border-b border-border"
              iconBgClass="bg-app-blue/20"
              textClass="text-app-blue"
            />
            <BudgetRuleCard
              title={`Wants (${wantsTarget}%)`}
              subtitle="Entertainment, Shopping, etc."
              icon={Sparkles}
              value={spendingBreakdown?.discretionary ?? 0}
              percent={budgetRuleMetrics?.discretionaryPercent ?? 0}
              target={`\u2264${wantsTarget}%`}
              targetPercent={wantsTarget}
              isOverBudget={budgetRuleMetrics?.isOverspendingDiscretionary ?? false}
              accentColor={SPENDING_TYPE_COLORS.discretionary}
              bgClass="border-b border-border"
              iconBgClass="bg-app-orange/20"
              textClass="text-app-orange"
            />
            <BudgetRuleCard
              title={`Savings (${savingsTarget}%)`}
              // Names the numerator AND the preference the floor comes from. The
              // /budgets Savings card carries a different number under the same
              // word, so "which target is this" has to be readable on the card
              // rather than inferred from the page it sits on.
              subtitle="Income minus Expenses, vs Savings Goal"
              icon={PiggyBank}
              value={savings}
              percent={budgetRuleMetrics?.savingsPercent ?? 0}
              target={`\u2265${savingsTarget}%`}
              targetPercent={savingsTarget}
              isOverBudget={budgetRuleMetrics?.isUnderSaving ?? false}
              accentColor={SAVINGS_COLOR}
              bgClass=""
              iconBgClass="bg-app-green/20"
              textClass="text-app-green"
            />
          </div>
        </div>
      ) : (
        <EmptyState
          icon={ShieldCheck}
          title="No spending data available"
          description="Configure essential categories in Settings to see your spending analysis."
          actionLabel="Go to Settings"
          actionHref="/settings"
        />
      )}
    </motion.section>
  )
}
