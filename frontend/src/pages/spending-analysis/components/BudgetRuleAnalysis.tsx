import { motion } from 'motion/react'
import { PiggyBank, ShieldCheck, Sparkles } from 'lucide-react'
import { Pie, PieChart, Tooltip } from 'recharts'

import EmptyState from '@/components/shared/EmptyState'
import {
  ChartContainer,
  chartTooltipProps,
  currencyTooltipFormatter,
  shouldAnimate,
} from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { SCROLL_FADE_UP } from '@/constants/animations'
import { SPENDING_TYPE_COLORS } from '@/lib/preferencesUtils'

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
  return (
    <motion.section
      className="glass rounded-xl border border-border p-4 sm:p-6"
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
      <h2 className="text-lg font-semibold text-foreground">
        Budget Rule Analysis: Needs {needsTarget}% / Wants {wantsTarget}%
      </h2>
      <p className="mb-4 mt-1 text-xs text-muted-foreground">
        Needs and Wants are capped shares of income. The Savings floor of{' '}
        {savingsTarget}% is your Savings Goal, applied to income left after
        expenses. The Budget Rule page scores a separate target against money
        actually moved into investments, so the two savings figures differ by
        design.
      </p>

      {spendingChartData.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          <div className="flex min-w-0 flex-col items-center">
            <div className="h-44 w-44 sm:h-48 sm:w-48 lg:h-56 lg:w-56">
              <ChartContainer ariaLabel="Donut showing your actual Needs, Wants, and Savings split of income">
                <PieChart>
                  <Pie
                    data={spendingChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius="58%"
                    outerRadius="85%"
                    dataKey="value"
                    strokeWidth={0}
                    paddingAngle={2}
                    isAnimationActive={shouldAnimate(spendingChartData.length)}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                  <Tooltip {...chartTooltipProps} formatter={currencyTooltipFormatter} />
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                    <tspan x="50%" dy="-4" fill={rawColors.text.tertiary} fontSize="11">
                      Actual split
                    </tspan>
                    <tspan x="50%" dy="16" fill={rawColors.text.tertiary} fontSize="11">
                      of income
                    </tspan>
                  </text>
                </PieChart>
              </ChartContainer>
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
              {spendingChartData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: item.fill }}
                    aria-hidden="true"
                  />
                  <span className="text-sm text-foreground">{item.name}</span>
                </div>
              ))}
            </div>
          </div>

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
            bgClass="bg-app-blue/10 border border-app-blue/20"
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
            bgClass="bg-app-orange/10 border border-app-orange/20"
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
            bgClass="bg-app-green/10 border border-app-green/20"
            iconBgClass="bg-app-green/20"
            textClass="text-app-green"
          />
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
