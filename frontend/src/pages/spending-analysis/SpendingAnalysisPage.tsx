import { motion } from 'framer-motion'
import { SCROLL_FADE_UP } from '@/constants/animations'
import { TrendingDown, Tag, PieChart, ShieldCheck, Sparkles, PiggyBank, Activity } from 'lucide-react' // Activity used for Monthly Avg card
import MetricCard from '@/components/shared/MetricCard'
import Sparkline from '@/components/shared/Sparkline'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { formatMonthKey } from '@/lib/dateUtils'
import {
  PieChart as RechartsPie, Pie, Cell, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Line,
} from 'recharts'
import { SPENDING_TYPE_COLORS } from '@/lib/preferencesUtils'
import { rawColors } from '@/constants/colors'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import EmptyState from '@/components/shared/EmptyState'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { FilterBanner } from '@/components/shared/FilterBanner'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import {
  ExpenseTreemap,
  EnhancedSubcategoryAnalysis,
  MultiCategoryTimeAnalysis,
  ParetoChart,
  TopMerchants,
  CohortSpendingAnalysis,
} from '@/components/analytics'
import {
  chartTooltipProps, PageHeader, ChartContainer, shouldAnimate,
  GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, areaGradient, areaGradientUrl,
  referenceLine, currencyTooltipFormatter,
} from '@/components/ui'

import { SAVINGS_COLOR } from './spendingAnalysisUtils'
import { BudgetRuleCard } from './components/BudgetRuleCard'
import { useSpendingAnalysis } from './useSpendingAnalysis'

export default function SpendingAnalysisPage() {
  const dims = useChartDimensions()
  const {
    categoryFilter, clearCategoryFilter,
    timeFilterProps, dateRangeCompat, isLoading,
    totalSpending, monthlyAvgSpending, savings,
    categoryBreakdown, categoriesCount, subcategoriesCount,
    topCategory, topCategoryAmount,
    spendingBreakdown, spendingChartData, spendingLegendColorStyles,
    budgetRuleMetrics,
    needsTarget, wantsTarget, savingsTarget,
    monthlyTrendData, peakExpense,
  } = useSpendingAnalysis()

  if (isLoading) return <PageSkeleton />

  return (
    <div className="min-h-dvh p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        <PageHeader
          title="Spending Analysis"
          subtitle="Track and analyze your spending patterns"
          action={
            <AnalyticsTimeFilter {...timeFilterProps} />
          }
        />

        <FilterBanner value={categoryFilter} label="Category" onClear={clearCategoryFilter} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          <MetricCard title="Total Spending" value={formatCurrency(totalSpending)} icon={TrendingDown} color="red" isLoading={isLoading} />
          <MetricCard
            title="Monthly Avg"
            value={formatCurrency(monthlyAvgSpending)}
            icon={Activity}
            color="orange"
            isLoading={isLoading}
            subtitle="Average spending per month"
            trend={
              monthlyTrendData.length >= 2 ? (
                <Sparkline
                  data={monthlyTrendData.map((d) => d.expense)}
                  color={rawColors.app.orange}
                  height={40}
                  showTooltip={false}
                />
              ) : undefined
            }
          />
          <MetricCard title="Top Category" value={topCategory} icon={Tag} color="blue" isLoading={isLoading} subtitle={topCategoryAmount > 0 ? formatCurrency(topCategoryAmount) : undefined} />
          <MetricCard title="Categories" value={`${categoriesCount} / ${subcategoriesCount}`} icon={PieChart} color="purple" isLoading={isLoading} subtitle="Categories / Subcategories" />
        </div>

        {/* 50/30/20 Budget Rule Analysis */}
        <motion.div
          className="glass p-4 sm:p-6 rounded-xl border border-border"
          {...SCROLL_FADE_UP}
        >
          <h3 className="text-lg font-semibold text-white mb-4">{needsTarget}/{wantsTarget}/{savingsTarget} Budget Rule Analysis</h3>
          {spendingChartData.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              {/* Actual Needs/Wants/Savings split. The target ring was dropped --
                  two rings at different radii made equal shares look unequal, so
                  the per-category cards (each with a target line) carry the
                  goal comparison instead. */}
              <div className="flex flex-col items-center">
                <div className="w-44 h-44 md:w-48 md:h-48 lg:w-56 lg:h-56">
                  <ChartContainer ariaLabel="Donut showing your actual Needs, Wants, and Savings split of income">
                    <RechartsPie>
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

                      <Tooltip
                        {...chartTooltipProps}
                        formatter={currencyTooltipFormatter}
                      />

                      {/* Center label */}
                      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                        <tspan x="50%" dy="-4" fill={rawColors.text.tertiary} fontSize="11">Actual split</tspan>
                        <tspan x="50%" dy="16" fill={rawColors.text.tertiary} fontSize="11">of income</tspan>
                      </text>
                    </RechartsPie>
                  </ChartContainer>
                </div>
                {/* Category legend */}
                <div className="flex gap-6 mt-4">
                  {spendingChartData.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={spendingLegendColorStyles[i]}
                      />
                      <span className="text-sm text-foreground">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Needs Card */}
              <BudgetRuleCard
                title={`Needs (${needsTarget}%)`}
                subtitle="Housing, Healthcare, Food, etc."
                icon={ShieldCheck}
                value={spendingBreakdown?.essential || 0}
                percent={budgetRuleMetrics?.essentialPercent || 0}
                target={`\u2264${needsTarget}%`}
                targetPercent={needsTarget}
                isOverBudget={budgetRuleMetrics?.isOverspendingEssential || false}
                accentColor={SPENDING_TYPE_COLORS.essential}
                bgClass="bg-app-blue/10 border border-app-blue/20"
                iconBgClass="bg-app-blue/20"
                textClass="text-app-blue"
              />

              {/* Wants Card */}
              <BudgetRuleCard
                title={`Wants (${wantsTarget}%)`}
                subtitle="Entertainment, Shopping, etc."
                icon={Sparkles}
                value={spendingBreakdown?.discretionary || 0}
                percent={budgetRuleMetrics?.discretionaryPercent || 0}
                target={`\u2264${wantsTarget}%`}
                targetPercent={wantsTarget}
                isOverBudget={budgetRuleMetrics?.isOverspendingDiscretionary || false}
                accentColor={SPENDING_TYPE_COLORS.discretionary}
                bgClass="bg-app-orange/10 border border-app-orange/20"
                iconBgClass="bg-app-orange/20"
                textClass="text-app-orange"
              />

              {/* Savings Card */}
              <BudgetRuleCard
                title={`Savings (${savingsTarget}%)`}
                subtitle="Income minus Expenses"
                icon={PiggyBank}
                value={savings}
                percent={budgetRuleMetrics?.savingsPercent || 0}
                target={`\u2265${savingsTarget}%`}
                targetPercent={savingsTarget}
                isOverBudget={budgetRuleMetrics?.isUnderSaving || false}
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
        </motion.div>

        {/* Expense Trend -- monthly spend with a 3-month rolling average,
            mirroring the Income Analysis "Income Trend" chart. */}
        <motion.div className="glass p-4 md:p-6 rounded-xl border border-border" {...SCROLL_FADE_UP}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <TrendingDown className="w-5 h-5 text-app-red" />
              <div>
                <h3 className="text-lg font-semibold text-white">Expense Trend</h3>
                <p className="text-sm text-text-tertiary">Monthly spending with 3-month rolling average</p>
              </div>
            </div>
            {monthlyTrendData.length > 0 ? (
              <ChartContainer height={dims.chartHeight} ariaLabel="Monthly spending over time with a 3-month rolling average line, plus peak and average reference lines">
                <AreaChart data={monthlyTrendData} margin={dims.margin}>
                  <defs>
                    {areaGradient('expenseTrend', rawColors.app.red, 0.4, 0)}
                  </defs>
                  <CartesianGrid {...GRID_DEFAULTS} />
                  <XAxis {...xAxisDefaults(monthlyTrendData.length)} dataKey="label" />
                  <YAxis {...yAxisDefaults()} />
                  <Tooltip
                    {...chartTooltipProps}
                    labelFormatter={(_label: unknown, payload: ReadonlyArray<{ payload?: { month?: string } }>) => {
                      const month = payload?.[0]?.payload?.month
                      return month ? formatMonthKey(month, { month: 'long', year: 'numeric' }) : ''
                    }}
                    formatter={(value, name) => [
                      currencyTooltipFormatter(value),
                      name === 'expenseAvg' ? 'Spending (3m avg)' : 'Spending',
                    ]}
                    itemSorter={(item) => -(item.value as number)}
                  />
                  {referenceLine({ y: peakExpense, label: `Peak: ${formatCurrencyShort(peakExpense)}`, variant: 'peak' })}
                  {referenceLine({ y: monthlyAvgSpending, label: `Avg: ${formatCurrencyShort(monthlyAvgSpending)}`, variant: 'avg' })}
                  <Area
                    type="monotone"
                    dataKey="expense"
                    stroke={rawColors.app.red}
                    fill={areaGradientUrl('expenseTrend')}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={shouldAnimate(monthlyTrendData.length)}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                  <Line
                    type="monotone"
                    dataKey="expenseAvg"
                    stroke={rawColors.app.red}
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                    name="Spending (3m avg)"
                    isAnimationActive={shouldAnimate(monthlyTrendData.length)}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <ChartEmptyState height={dims.chartHeight} message="No spending in this range. Try a wider date range or upload more statements." />
            )}
          </div>
        </motion.div>

        {/* Expense Treemap */}
        <motion.div {...SCROLL_FADE_UP}>
          <ExpenseTreemap dateRange={dateRangeCompat} categoryFilter={categoryFilter} />
        </motion.div>

        {/* Pareto Analysis -- which categories make up 80% of spend */}
        <motion.div {...SCROLL_FADE_UP}>
          <ParetoChart categoryBreakdown={categoryBreakdown} />
        </motion.div>

        {/* Top Merchants */}
        <motion.div {...SCROLL_FADE_UP}>
          <TopMerchants dateRange={dateRangeCompat} categoryFilter={categoryFilter} />
        </motion.div>

        {/* Multi-Category Time Analysis */}
        <motion.div {...SCROLL_FADE_UP}>
          <MultiCategoryTimeAnalysis dateRange={dateRangeCompat} />
        </motion.div>

        {/* Subcategory Deep-Dive */}
        <motion.div {...SCROLL_FADE_UP}>
          <EnhancedSubcategoryAnalysis
            key={categoryFilter ?? 'all'}
            dateRange={dateRangeCompat}
            categoryFilter={categoryFilter}
          />
        </motion.div>

        {/* Spending Patterns (Day/Date/Seasonal) */}
        <motion.div {...SCROLL_FADE_UP}>
          <CohortSpendingAnalysis />
        </motion.div>

      </div>
    </div>
  )
}
