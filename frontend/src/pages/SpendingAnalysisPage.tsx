import { motion } from 'framer-motion'
import { SCROLL_FADE_UP } from '@/constants/animations'
import { TrendingDown, Tag, PieChart, ShieldCheck, Sparkles, PiggyBank, Lock, Shuffle, Activity } from 'lucide-react'
import MetricCard from '@/components/shared/MetricCard'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatCurrency, formatPercent, formatCurrencyShort } from '@/lib/formatters'
import { PieChart as RechartsPie, Pie, Cell, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import { calculateSpendingBreakdown, SPENDING_TYPE_COLORS } from '@/lib/preferencesUtils'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'
import { filterTransactionsByDateRange, computeCategoryBreakdown } from '@/lib/transactionUtils'
import EmptyState from '@/components/shared/EmptyState'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import {
  ExpenseTreemap,
  EnhancedSubcategoryAnalysis,
  MultiCategoryTimeAnalysis,
  YearOverYearComparison,
  RecurringTransactions,
  TopMerchants,
  CohortSpendingAnalysis,
} from '@/components/analytics'
import { chartTooltipProps, PageHeader, ChartContainer, shouldAnimate, GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, areaGradient, areaGradientUrl, ACTIVE_DOT, LEGEND_DEFAULTS } from '@/components/ui'
import { SEMANTIC_COLORS } from '@/constants/chartColors'
import { rawColors } from '@/constants/colors'

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
  const statusColorClass = isOverBudget ? 'text-ios-red' : 'text-ios-green'

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

/** Spending Velocity: cumulative daily spending for current vs previous period */
function SpendingVelocityChart({
  filteredTransactions,
  dateRange,
  allTransactions,
}: Readonly<{
  filteredTransactions: Array<{ date: string; type: string; amount: number }>
  dateRange: { start_date: string | null; end_date: string | null }
  allTransactions: Array<{ date: string; type: string; amount: number }> | undefined
}>) {
  const velocityData = useMemo(() => {
    if (!dateRange.start_date || !dateRange.end_date || !allTransactions) return []

    const start = new Date(dateRange.start_date)
    const end = new Date(dateRange.end_date)
    const periodLengthMs = end.getTime() - start.getTime()
    if (periodLengthMs <= 0) return []

    // Previous period: same duration before the current period
    const prevStart = new Date(start.getTime() - periodLengthMs - 86400000) // -1 day offset for inclusive
    const prevEnd = new Date(start.getTime() - 86400000)

    // Get expenses for current period
    const currentExpenses = filteredTransactions
      .filter((t) => t.type === 'Expense')
      .map((t) => ({ day: Math.floor((new Date(t.date).getTime() - start.getTime()) / 86400000) + 1, amount: Math.abs(t.amount) }))

    // Get expenses for previous period
    const previousExpenses = (allTransactions || [])
      .filter((t) => {
        if (t.type !== 'Expense') return false
        const d = t.date.substring(0, 10)
        return d >= prevStart.toISOString().substring(0, 10) && d <= prevEnd.toISOString().substring(0, 10)
      })
      .map((t) => ({ day: Math.floor((new Date(t.date).getTime() - prevStart.getTime()) / 86400000) + 1, amount: Math.abs(t.amount) }))

    // Determine number of days in period
    const totalDays = Math.ceil(periodLengthMs / 86400000) + 1
    const daysToShow = Math.min(totalDays, 31) // Cap at 31 for readability

    // Build cumulative arrays
    const currentDaily: number[] = new Array(daysToShow).fill(0)
    const previousDaily: number[] = new Array(daysToShow).fill(0)

    for (const e of currentExpenses) {
      if (e.day >= 1 && e.day <= daysToShow) currentDaily[e.day - 1] += e.amount
    }
    for (const e of previousExpenses) {
      if (e.day >= 1 && e.day <= daysToShow) previousDaily[e.day - 1] += e.amount
    }

    // Accumulate
    const result: Array<{ day: number; current: number; previous: number }> = []
    let cumCurrent = 0
    let cumPrevious = 0
    for (let i = 0; i < daysToShow; i++) {
      cumCurrent += currentDaily[i]
      cumPrevious += previousDaily[i]
      result.push({ day: i + 1, current: cumCurrent, previous: cumPrevious })
    }

    return result
  }, [filteredTransactions, dateRange, allTransactions])

  if (velocityData.length === 0) return null

  const currentTotal = velocityData.at(-1)?.current ?? 0
  const previousTotal = velocityData.at(-1)?.previous ?? 0
  const diff = currentTotal - previousTotal
  const isFaster = diff > 0

  return (
    <motion.div className="glass p-6 rounded-xl border border-border" {...SCROLL_FADE_UP}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-ios-teal/20 rounded-xl shadow-lg shadow-ios-teal/20">
            <Activity className="w-5 h-5 text-ios-teal" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Spending Velocity</h3>
            <p className="text-xs text-muted-foreground">
              Cumulative daily spending: current vs previous period
            </p>
          </div>
        </div>
        {previousTotal > 0 && (
          <div className={`text-sm font-medium px-3 py-1 rounded-lg ${isFaster ? 'bg-ios-red/15 text-ios-red' : 'bg-ios-green/15 text-ios-green'}`}>
            {isFaster ? 'Spending faster' : 'Spending slower'} ({diff > 0 ? '+' : ''}{formatCurrency(diff)})
          </div>
        )}
      </div>
      <div style={{ height: 320 }}>
        <ChartContainer>
          <AreaChart data={velocityData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <defs>
              {areaGradient('velocity-current', rawColors.ios.teal, 0.3, 0.02)}
            </defs>
            <CartesianGrid {...GRID_DEFAULTS} />
            <XAxis
              dataKey="day"
              {...xAxisDefaults(velocityData.length)}
              tickFormatter={(v: number) => `Day ${v}`}
            />
            <YAxis
              {...yAxisDefaults()}
              tickFormatter={(v: number) => formatCurrencyShort(v)}
            />
            <Tooltip
              {...chartTooltipProps}
              labelFormatter={((label: number) => `Day ${label}`) as never}
              formatter={((value: number, name: string) => [
                formatCurrency(value),
                name === 'current' ? 'This Period' : 'Last Period',
              ]) as never}
            />
            <Legend
              {...LEGEND_DEFAULTS}
              formatter={(value: string) => (value === 'current' ? 'This Period' : 'Last Period')}
            />
            <Area
              type="monotone"
              dataKey="current"
              stroke={rawColors.ios.teal}
              fill={areaGradientUrl('velocity-current')}
              strokeWidth={2}
              dot={false}
              activeDot={ACTIVE_DOT}
              isAnimationActive={shouldAnimate(velocityData.length)}
              animationDuration={600}
              animationEasing="ease-out"
            />
            <Area
              type="monotone"
              dataKey="previous"
              stroke={rawColors.ios.purple}
              fill="transparent"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              activeDot={ACTIVE_DOT}
              isAnimationActive={shouldAnimate(velocityData.length)}
              animationDuration={600}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </motion.div>
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
  const topCategory =
    Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'

  // Calculate essential vs discretionary spending
  const spendingBreakdown = useMemo(() => {
    if (!filteredTransactions || !preferences) return null
    return calculateSpendingBreakdown(filteredTransactions, preferences.essential_categories)
  }, [filteredTransactions, preferences])

  // Parse fixed_expense_categories (may be JSON string or array)
  const fixedExpenseCategories = useMemo<string[]>(() => {
    const raw = preferences?.fixed_expense_categories
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }, [preferences])

  // Calculate fixed vs variable spending breakdown
  const fixedVariableBreakdown = useMemo(() => {
    if (!filteredTransactions || fixedExpenseCategories.length === 0) return null
    let fixed = 0
    let variable = 0
    const fixedSet = new Set(fixedExpenseCategories.map((c) => c.toLowerCase()))

    filteredTransactions
      .filter((t) => t.type === 'Expense')
      .forEach((t) => {
        const key = `${t.category}::${t.subcategory || ''}`.toLowerCase()
        const amount = Math.abs(t.amount)
        if (fixedSet.has(key)) {
          fixed += amount
        } else {
          variable += amount
        }
      })

    const total = fixed + variable
    return {
      fixed,
      variable,
      total,
      fixedPercent: total > 0 ? (fixed / total) * 100 : 0,
      variablePercent: total > 0 ? (variable / total) * 100 : 0,
    }
  }, [filteredTransactions, fixedExpenseCategories])

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

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Spending Analysis"
          subtitle="Track and analyze your spending patterns"
          action={
            <AnalyticsTimeFilter {...timeFilterProps} />
          }
        />

        <div className={`grid grid-cols-1 sm:grid-cols-2 ${fixedVariableBreakdown ? 'lg:grid-cols-3 xl:grid-cols-5' : 'lg:grid-cols-3'} gap-4 sm:gap-6`}>
          <MetricCard title="Total Spending" value={formatCurrency(totalSpending)} icon={TrendingDown} color="red" isLoading={isLoading} />
          <MetricCard title="Top Category" value={topCategory} icon={Tag} color="blue" isLoading={isLoading} />
          <MetricCard title="Categories Tracked" value={categoriesCount} icon={PieChart} color="blue" isLoading={isLoading} />

          {fixedVariableBreakdown && (
            <>
              <MetricCard title="Fixed" value={formatCurrency(fixedVariableBreakdown.fixed)} icon={Lock} color="purple" isLoading={isLoading} subtitle={`${formatPercent(fixedVariableBreakdown.fixedPercent)} of spending`} />
              <MetricCard title="Variable" value={formatCurrency(fixedVariableBreakdown.variable)} icon={Shuffle} color="teal" isLoading={isLoading} subtitle={`${formatPercent(fixedVariableBreakdown.variablePercent)} of spending`} />
            </>
          )}
        </div>

        {/* 50/30/20 Budget Rule Analysis */}
        <motion.div
          className="glass p-6 rounded-xl border border-border"
          {...SCROLL_FADE_UP}
        >
          <h3 className="text-lg font-semibold text-white mb-4">{needsTarget}/{wantsTarget}/{savingsTarget} Budget Rule Analysis</h3>
          {spendingChartData.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Nested Donut Chart: Inner = Target, Outer = Actual */}
              <div className="flex flex-col items-center">
                <div className="w-56 h-56">
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
                <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
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
                bgClass="bg-ios-blue/10 border border-ios-blue/20"
                iconBgClass="bg-ios-blue/20"
                textClass="text-ios-blue"
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
                bgClass="bg-ios-orange/10 border border-ios-orange/20"
                iconBgClass="bg-ios-orange/20"
                textClass="text-ios-orange"
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
                bgClass="bg-ios-green/10 border border-ios-green/20"
                iconBgClass="bg-ios-green/20"
                textClass="text-ios-green"
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

        {/* Spending Velocity: Current vs Previous Period */}
        <SpendingVelocityChart
          filteredTransactions={filteredTransactions}
          dateRange={dateRange}
          allTransactions={transactions}
        />

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

        {/* Year-over-Year & Recurring */}
        <motion.div className="grid grid-cols-1 lg:grid-cols-2 gap-6" {...SCROLL_FADE_UP}>
          <YearOverYearComparison />
          <RecurringTransactions />
        </motion.div>
      </div>
    </div>
  )
}
