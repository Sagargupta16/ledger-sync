import { motion } from 'framer-motion'
import { PiggyBank, ShieldCheck, Sparkles } from 'lucide-react'
import { Cell, Pie, PieChart, Tooltip } from 'recharts'

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
  color: string
}

interface BudgetRuleAnalysisProps {
  readonly needsTarget: number
  readonly wantsTarget: number
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
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        {needsTarget}/{wantsTarget}/{savingsTarget} Budget Rule Analysis
      </h2>

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
                  >
                    {spendingChartData.map((entry) => (
                      <Cell key={`cell-${entry.name}`} fill={entry.color} />
                    ))}
                  </Pie>
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
                    style={{ backgroundColor: item.color }}
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
            subtitle="Income minus Expenses"
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
