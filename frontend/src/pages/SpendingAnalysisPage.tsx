import { motion } from 'framer-motion'
import { fadeUpWithDelay, SCROLL_FADE_UP } from '@/constants/animations'
import { TrendingDown, Tag, PieChart, ShieldCheck, Sparkles, PiggyBank, Lock, Shuffle } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Tooltip } from 'recharts'
import { calculateSpendingBreakdown, SPENDING_TYPE_COLORS } from '@/lib/preferencesUtils'
import { getCurrentYear, getCurrentMonth, getCurrentFY, getAnalyticsDateRange, type AnalyticsViewMode } from '@/lib/dateUtils'
import { computeDataDateRange, filterTransactionsByDateRange, computeCategoryBreakdown } from '@/lib/transactionUtils'
import EmptyState from '@/components/shared/EmptyState'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import {
  ExpenseTreemap,
  EnhancedSubcategoryAnalysis,
  MultiCategoryTimeAnalysis,
  YearOverYearComparison,
  RecurringTransactions,
  TopMerchants,
} from '@/components/analytics'
import { chartTooltipProps, PageHeader } from '@/components/ui'
import { SEMANTIC_COLORS } from '@/constants/chartColors'
import { usePreferencesStore } from '@/store/preferencesStore'

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

export default function SpendingAnalysisPage() {
  const navigate = useNavigate()
  const { data: transactions } = useTransactions()
  const { data: preferences } = usePreferences()
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4

  // Time filter state
  const { displayPreferences } = usePreferencesStore()
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>(
    (displayPreferences.defaultTimeRange as AnalyticsViewMode) || 'fy'
  )
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [currentFY, setCurrentFY] = useState(getCurrentFY(fiscalYearStartMonth))

  // Get date range based on current filter
  const dateRange = useMemo(() => {
    return getAnalyticsDateRange(viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth)
  }, [viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth])

  const dataDateRange = useMemo(() => computeDataDateRange(transactions), [transactions])

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
            <AnalyticsTimeFilter
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              currentYear={currentYear}
              currentMonth={currentMonth}
              currentFY={currentFY}
              onYearChange={setCurrentYear}
              onMonthChange={setCurrentMonth}
              onFYChange={setCurrentFY}
              minDate={dataDateRange.minDate}
              maxDate={dataDateRange.maxDate}
              fiscalYearStartMonth={fiscalYearStartMonth}
            />
          }
        />

        <div className={`grid grid-cols-1 sm:grid-cols-2 ${fixedVariableBreakdown ? 'lg:grid-cols-5' : 'lg:grid-cols-3'} gap-4 sm:gap-6`}>
          <motion.div {...fadeUpWithDelay(0.2)} className="glass rounded-xl border border-border p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-ios-red/20 rounded-xl shadow-lg shadow-ios-red/30">
                <TrendingDown className="w-6 h-6 text-ios-red" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Spending</p>
                <p className="text-2xl font-bold">{isLoading ? '...' : formatCurrency(totalSpending)}</p>
              </div>
            </div>
          </motion.div>

          <motion.div {...fadeUpWithDelay(0.3)} className="glass rounded-xl border border-border p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/20 rounded-xl shadow-lg shadow-primary/30">
                <Tag className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Top Category</p>
                <p className="text-2xl font-bold">{isLoading ? '...' : topCategory}</p>
              </div>
            </div>
          </motion.div>

          <motion.div {...fadeUpWithDelay(0.4)} className="glass rounded-xl border border-border p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-ios-blue/20 rounded-xl shadow-lg shadow-ios-blue/30">
                <PieChart className="w-6 h-6 text-ios-blue" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Categories Tracked</p>
                <p className="text-2xl font-bold">{isLoading ? '...' : categoriesCount}</p>
              </div>
            </div>
          </motion.div>

          {fixedVariableBreakdown && (
            <>
              <motion.div {...fadeUpWithDelay(0.5)} className="glass rounded-xl border border-border p-6 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-ios-purple/20 rounded-xl shadow-lg shadow-ios-purple/30">
                    <Lock className="w-6 h-6 text-ios-purple" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Fixed</p>
                    <p className="text-2xl font-bold">{formatCurrency(fixedVariableBreakdown.fixed)}</p>
                    <p className="text-xs text-muted-foreground">{formatPercent(fixedVariableBreakdown.fixedPercent)} of spending</p>
                  </div>
                </div>
              </motion.div>

              <motion.div {...fadeUpWithDelay(0.6)} className="glass rounded-xl border border-border p-6 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-ios-teal/20 rounded-xl shadow-lg shadow-ios-teal/30">
                    <Shuffle className="w-6 h-6 text-ios-teal" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Variable</p>
                    <p className="text-2xl font-bold">{formatCurrency(fixedVariableBreakdown.variable)}</p>
                    <p className="text-xs text-muted-foreground">{formatPercent(fixedVariableBreakdown.variablePercent)} of spending</p>
                  </div>
                </div>
              </motion.div>
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
              {/* Pie Chart */}
              <div className="flex flex-col items-center">
                <div className="w-48 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={spendingChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        dataKey="value"
                        stroke="none"
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
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
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
          <ExpenseTreemap dateRange={dateRange} />
        </motion.div>

        {/* Top Merchants */}
        <motion.div {...SCROLL_FADE_UP}>
          <TopMerchants dateRange={dateRange} />
        </motion.div>

        {/* Multi-Category Time Analysis */}
        <motion.div {...SCROLL_FADE_UP}>
          <MultiCategoryTimeAnalysis dateRange={dateRange} />
        </motion.div>

        {/* Subcategory Deep-Dive */}
        <motion.div {...SCROLL_FADE_UP}>
          <EnhancedSubcategoryAnalysis dateRange={dateRange} />
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
