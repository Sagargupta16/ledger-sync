import { motion } from 'framer-motion'
import { SCROLL_FADE_UP } from '@/constants/animations'
import { TrendingDown, Tag, PieChart, ShieldCheck, Sparkles, PiggyBank, Activity } from 'lucide-react' // Activity used for Monthly Avg card
import MetricCard from '@/components/shared/MetricCard'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { PieChart as RechartsPie, Pie, Cell, Tooltip } from 'recharts'
import { calculateSpendingBreakdown, SPENDING_TYPE_COLORS } from '@/lib/preferencesUtils'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'
import { filterTransactionsByDateRange, computeCategoryBreakdown } from '@/lib/transactionUtils'
import EmptyState from '@/components/shared/EmptyState'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import {
  ExpenseTreemap,
  EnhancedSubcategoryAnalysis,
  MultiCategoryTimeAnalysis,
  TopMerchants,
  CohortSpendingAnalysis,
} from '@/components/analytics'
import { chartTooltipProps, PageHeader, ChartContainer, shouldAnimate } from '@/components/ui'
import { SEMANTIC_COLORS } from '@/constants/chartColors'

// Color for Savings
const SAVINGS_COLOR = SEMANTIC_COLORS.income

/** Build chart data for the 50/30/20 spending breakdown */
function buildSpendingChartData(
  spendingBreakdown: { essential: number; discretionary: number } | null,
  totalIncome: number,
  savings: number,
) {
  if (!spendingBreakdown || totalIncome <= 0) return []
  return [
    { name: 'Needs', value: spendingBreakdown.essential, color: SPENDING_TYPE_COLORS.essential },
    { name: 'Wants', value: spendingBreakdown.discretionary, color: SPENDING_TYPE_COLORS.discretionary },
    { name: 'Savings', value: savings, color: SAVINGS_COLOR },
  ].filter((d) => d.value > 0)
}

/** Calculate the budget rule metrics (50/30/20) based on income breakdown */
function computeBudgetRuleMetrics(
  spendingBreakdown: { essential: number; discretionary: number } | null,
  totalIncome: number,
  savings: number,
  needsTarget: number,
  wantsTarget: number,
  savingsTargetPct: number,
): {
  essentialPercent: number
  discretionaryPercent: number
  savingsPercent: number
  essentialTarget: number
  discretionaryTarget: number
  savingsTarget: number
  isOverspendingEssential: boolean
  isOverspendingDiscretionary: boolean
  isUnderSaving: boolean
} | null {
  if (!spendingBreakdown || totalIncome <= 0) return null

  const essentialPercent = (spendingBreakdown.essential / totalIncome) * 100
  const discretionaryPercent = (spendingBreakdown.discretionary / totalIncome) * 100
  const savingsPercent = (savings / totalIncome) * 100

  return {
    essentialPercent,
    discretionaryPercent,
    savingsPercent,
    essentialTarget: needsTarget,
    discretionaryTarget: wantsTarget,
    savingsTarget: savingsTargetPct,
    isOverspendingEssential: essentialPercent > needsTarget + 5,
    isOverspendingDiscretionary: discretionaryPercent > wantsTarget + 5,
    isUnderSaving: savingsPercent < savingsTargetPct - 5,
  }
}

/** A single budget rule card (Needs/Wants/Savings) */
function BudgetRuleCard({ title, subtitle, icon: Icon, value, percent, target, isOverBudget, accentColor, bgClass, iconBgClass, textClass, delay }: Readonly<{
  title: string
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
  value: number
  percent: number
  target: string
  isOverBudget: boolean
  accentColor: string
  bgClass: string
  iconBgClass: string
  textClass: string
  delay: number
}>) {
  const barColor = isOverBudget ? SEMANTIC_COLORS.expense : accentColor
  const statusColorClass = isOverBudget ? 'text-app-red' : 'text-app-green'

  return (
    <div className={`p-4 rounded-lg ${bgClass}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 ${iconBgClass} rounded-lg`}>
          <Icon className={`w-5 h-5 ${textClass}`} />
        </div>
        <div>
          <p className="font-medium text-white">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <p className={`text-2xl font-bold ${textClass} mb-2`}>
        {formatCurrency(value)}
      </p>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Current</span>
          <span className={statusColorClass}>
            {formatPercent(percent)}
          </span>
        </div>
        <div className="h-2 bg-surface-dropdown rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(percent, 100)}%` }}
            transition={{ duration: 0.8, ease: 'easeOut', delay }}
            style={{ backgroundColor: barColor }}
          />
        </div>
        <p className="text-xs text-text-tertiary">Target: {target} of income</p>
      </div>
    </div>
  )
}

export default function SpendingAnalysisPage() {
  const navigate = useNavigate()
  const { data: transactions } = useTransactions()
  const { data: preferences } = usePreferences()
  const { dateRange, timeFilterProps } = useAnalyticsTimeFilter(transactions)
  // Convert null to undefined for component compatibility
  const dateRangeCompat = { start_date: dateRange.start_date ?? undefined, end_date: dateRange.end_date ?? undefined }

  // Filter transactions by date range
  const filteredTransactions = useMemo(
    () => filterTransactionsByDateRange(transactions, dateRange),
    [transactions, dateRange]
  )

  // Calculate totals for filtered period
  const totalSpending = useMemo(() => {
    return filteredTransactions
      .filter((t) => t.type === 'Expense')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
  }, [filteredTransactions])

  // Calculate total income for filtered period
  const totalIncome = useMemo(() => {
    return filteredTransactions
      .filter((t) => t.type === 'Income')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
  }, [filteredTransactions])

  // Calculate savings (Income - Expenses)
  const savings = Math.max(0, totalIncome - totalSpending)

  // Get category breakdown for filtered transactions
  const categoryBreakdown = useMemo(
    () => computeCategoryBreakdown(filteredTransactions),
    [filteredTransactions]
  )

  const categoriesCount = Object.keys(categoryBreakdown).length
  const subcategoriesCount = useMemo(() => {
    if (!filteredTransactions) return 0
    const subs = new Set<string>()
    filteredTransactions.filter((t) => t.type === 'Expense' && t.subcategory).forEach((t) => subs.add(`${t.category}::${t.subcategory}`))
    return subs.size
  }, [filteredTransactions])
  const topCategoryEntry = Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1])[0]
  const topCategory = topCategoryEntry?.[0] || 'N/A'
  const topCategoryAmount = topCategoryEntry?.[1] ?? 0

  // Calculate essential vs discretionary spending
  const spendingBreakdown = useMemo(() => {
    if (!filteredTransactions || !preferences) return null
    return calculateSpendingBreakdown(filteredTransactions, preferences.essential_categories)
  }, [filteredTransactions, preferences])

  // Monthly average spending
  const monthlyAvgSpending = useMemo(() => {
    if (!filteredTransactions) return 0
    const expenses = filteredTransactions.filter((t) => t.type === 'Expense')
    if (expenses.length === 0) return 0
    const months = new Set(expenses.map((t) => t.date.slice(0, 7)))
    const total = expenses.reduce((s, t) => s + Math.abs(t.amount), 0)
    return months.size > 0 ? total / months.size : 0
  }, [filteredTransactions])

  // Prepare spending breakdown chart data (50/30/20 rule with income base)
  const spendingChartData = useMemo(
    () => buildSpendingChartData(spendingBreakdown, totalIncome, savings),
    [spendingBreakdown, savings, totalIncome]
  )

  // Spending rule targets from preferences (configurable Needs/Wants/Savings)
  const needsTarget = preferences?.needs_target_percent ?? 50
  const wantsTarget = preferences?.wants_target_percent ?? 30
  const savingsTarget = preferences?.savings_target_percent ?? 20

  // Calculate spending rule metrics (based on income)
  const budgetRuleMetrics = useMemo(() => {
    return computeBudgetRuleMetrics(spendingBreakdown, totalIncome, savings, needsTarget, wantsTarget, savingsTarget)
  }, [spendingBreakdown, totalIncome, savings, needsTarget, wantsTarget, savingsTarget])

  // Precomputed style objects for chart legend (stable references across renders)
  const spendingLegendColorStyles = useMemo(
    () => spendingChartData.map((item) => ({ backgroundColor: item.color })),
    [spendingChartData]
  )

  const isLoading = !transactions

  if (isLoading) return <PageSkeleton />

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        <PageHeader
          title="Spending Analysis"
          subtitle="Track and analyze your spending patterns"
          action={
            <AnalyticsTimeFilter {...timeFilterProps} />
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          <MetricCard title="Total Spending" value={formatCurrency(totalSpending)} icon={TrendingDown} color="red" isLoading={isLoading} />
          <MetricCard title="Monthly Avg" value={formatCurrency(monthlyAvgSpending)} icon={Activity} color="orange" isLoading={isLoading} subtitle="Average spending per month" />
          <MetricCard title="Top Category" value={topCategory} icon={Tag} color="blue" isLoading={isLoading} subtitle={topCategoryAmount > 0 ? formatCurrency(topCategoryAmount) : undefined} />
          <MetricCard title="Categories" value={`${categoriesCount} / ${subcategoriesCount}`} icon={PieChart} color="purple" isLoading={isLoading} subtitle="Categories / Subcategories" />
        </div>

        {/* 50/30/20 Budget Rule Analysis */}
        <motion.div
          className="glass p-6 rounded-xl border border-border"
          {...SCROLL_FADE_UP}
        >
          <h3 className="text-lg font-semibold text-white mb-4">{needsTarget}/{wantsTarget}/{savingsTarget} Budget Rule Analysis</h3>
          {spendingChartData.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              {/* Nested Donut Chart: Inner = Target, Outer = Actual */}
              <div className="flex flex-col items-center">
                <div className="w-44 h-44 md:w-48 md:h-48 lg:w-56 lg:h-56">
                  <ChartContainer>
                    <RechartsPie>
                      {/* Inner ring: Target split */}
                      <Pie
                        data={[
                          { name: `Needs (${needsTarget}%)`, value: needsTarget, color: SPENDING_TYPE_COLORS.essential },
                          { name: `Wants (${wantsTarget}%)`, value: wantsTarget, color: SPENDING_TYPE_COLORS.discretionary },
                          { name: `Savings (${savingsTarget}%)`, value: savingsTarget, color: SAVINGS_COLOR },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius="30%"
                        outerRadius="45%"
                        dataKey="value"
                        strokeWidth={0}
                        paddingAngle={2}
                        opacity={0.4}
                        isAnimationActive={shouldAnimate(3)}
                        animationDuration={600}
                        animationEasing="ease-out"
                      >
                        <Cell fill={SPENDING_TYPE_COLORS.essential} />
                        <Cell fill={SPENDING_TYPE_COLORS.discretionary} />
                        <Cell fill={SAVINGS_COLOR} />
                      </Pie>

                      {/* Outer ring: Actual breakdown */}
                      <Pie
                        data={spendingChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius="55%"
                        outerRadius="80%"
                        dataKey="value"
                        strokeWidth={0}
                        paddingAngle={2}
                        isAnimationActive={shouldAnimate(spendingChartData.length)}
                        animationDuration={600}
                        animationEasing="ease-out"
                        onClick={(data: { name?: string }) => {
                          if (data?.name && data.name !== 'Savings') {
                            navigate(`/transactions?type=Expense&spending_type=${encodeURIComponent(data.name)}`)
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {spendingChartData.map((entry) => (
                          <Cell key={`cell-${entry.name}`} fill={entry.color} />
                        ))}
                      </Pie>

                      <Tooltip
                        {...chartTooltipProps}
                        formatter={(value: number | undefined) => value === undefined ? '' : formatCurrency(value)}
                      />

                      {/* Center label */}
                      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                        <tspan x="50%" dy="-6" fill="#71717a" fontSize="11">Actual vs</tspan>
                        <tspan x="50%" dy="16" fill="#71717a" fontSize="11">{needsTarget}/{wantsTarget}/{savingsTarget}</tspan>
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
                {/* Ring legend */}
                <div className="flex items-center gap-4 mt-2 text-xs text-text-tertiary">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-2 rounded-sm bg-white/20" />
                    <span>Inner = Target</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-2 rounded-sm bg-white/50" />
                    <span>Outer = Actual</span>
                  </div>
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
                isOverBudget={budgetRuleMetrics?.isOverspendingEssential || false}
                accentColor={SPENDING_TYPE_COLORS.essential}
                bgClass="bg-app-blue/10 border border-app-blue/20"
                iconBgClass="bg-app-blue/20"
                textClass="text-app-blue"
                delay={0.3}
              />

              {/* Wants Card */}
              <BudgetRuleCard
                title={`Wants (${wantsTarget}%)`}
                subtitle="Entertainment, Shopping, etc."
                icon={Sparkles}
                value={spendingBreakdown?.discretionary || 0}
                percent={budgetRuleMetrics?.discretionaryPercent || 0}
                target={`\u2264${wantsTarget}%`}
                isOverBudget={budgetRuleMetrics?.isOverspendingDiscretionary || false}
                accentColor={SPENDING_TYPE_COLORS.discretionary}
                bgClass="bg-app-orange/10 border border-app-orange/20"
                iconBgClass="bg-app-orange/20"
                textClass="text-app-orange"
                delay={0.4}
              />

              {/* Savings Card */}
              <BudgetRuleCard
                title={`Savings (${savingsTarget}%)`}
                subtitle="Income minus Expenses"
                icon={PiggyBank}
                value={savings}
                percent={budgetRuleMetrics?.savingsPercent || 0}
                target={`\u2265${savingsTarget}%`}
                isOverBudget={budgetRuleMetrics?.isUnderSaving || false}
                accentColor={SAVINGS_COLOR}
                bgClass="bg-app-green/10 border border-app-green/20"
                iconBgClass="bg-app-green/20"
                textClass="text-app-green"
                delay={0.5}
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

        {/* Expense Treemap */}
        <motion.div {...SCROLL_FADE_UP}>
          <ExpenseTreemap dateRange={dateRangeCompat} />
        </motion.div>

        {/* Top Merchants */}
        <motion.div {...SCROLL_FADE_UP}>
          <TopMerchants dateRange={dateRangeCompat} />
        </motion.div>

        {/* Multi-Category Time Analysis */}
        <motion.div {...SCROLL_FADE_UP}>
          <MultiCategoryTimeAnalysis dateRange={dateRangeCompat} />
        </motion.div>

        {/* Subcategory Deep-Dive */}
        <motion.div {...SCROLL_FADE_UP}>
          <EnhancedSubcategoryAnalysis dateRange={dateRangeCompat} />
        </motion.div>

        {/* Spending Patterns (Day/Date/Seasonal) */}
        <motion.div {...SCROLL_FADE_UP}>
          <CohortSpendingAnalysis />
        </motion.div>

      </div>
    </div>
  )
}
