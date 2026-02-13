import { motion } from 'framer-motion'
import { TrendingDown, Tag, PieChart, ShieldCheck, Sparkles, PiggyBank } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useMemo, useState } from 'react'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Tooltip } from 'recharts'
import { calculateSpendingBreakdown, SPENDING_TYPE_COLORS } from '@/lib/preferencesUtils'
import { getCurrentYear, getCurrentMonth, getCurrentFY, getAnalyticsDateRange, getDateKey, type AnalyticsViewMode } from '@/lib/dateUtils'
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

/** Compute the min/max date range from transaction data */
function computeDataDateRange(
  transactions: Array<{ date: string }> | undefined,
): { minDate: string | undefined; maxDate: string | undefined } {
  if (!transactions || transactions.length === 0) return { minDate: undefined, maxDate: undefined }
  const dates = transactions.map(t => t.date.substring(0, 10)).sort()
  return { minDate: dates[0], maxDate: dates.at(-1) }
}

/** Filter transactions by the given date range */
function filterTransactionsByDateRange(
  transactions: Array<{ date: string; [key: string]: unknown }> | undefined,
  dateRange: { start_date?: string; end_date?: string },
): Array<{ date: string; [key: string]: unknown }> {
  if (!transactions) return []
  if (!dateRange.start_date) return transactions

  return transactions.filter((t) => {
    const txDate = getDateKey(t.date)
    return txDate >= dateRange.start_date! && (!dateRange.end_date || txDate <= dateRange.end_date)
  })
}

/** Aggregate expense amounts by category */
function computeCategoryBreakdown(
  transactions: Array<{ type?: unknown; category?: unknown; amount: unknown }>,
): Record<string, number> {
  const categories: Record<string, number> = {}
  for (const t of transactions) {
    if (t.type !== 'Expense') continue
    const category = (t.category as string) || 'Uncategorized'
    categories[category] = (categories[category] || 0) + Math.abs(t.amount as number)
  }
  return categories
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

export default function SpendingAnalysisPage() {
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

  // Prepare spending breakdown chart data (50/30/20 rule with income base)
  const spendingChartData = useMemo(() => {
    if (!spendingBreakdown || totalIncome <= 0) return []
    return [
      { name: 'Needs', value: spendingBreakdown.essential, color: SPENDING_TYPE_COLORS.essential },
      { name: 'Wants', value: spendingBreakdown.discretionary, color: SPENDING_TYPE_COLORS.discretionary },
      { name: 'Savings', value: savings, color: SAVINGS_COLOR },
    ].filter((d) => d.value > 0)
  }, [spendingBreakdown, savings, totalIncome])

  // Spending rule targets from preferences (configurable Needs/Wants/Savings)
  const needsTarget = preferences?.needs_target_percent ?? 50
  const wantsTarget = preferences?.wants_target_percent ?? 30
  const savingsTarget = preferences?.savings_target_percent ?? 20

  // Calculate spending rule metrics (based on income)
  const budgetRuleMetrics = useMemo(() => {
    return computeBudgetRuleMetrics(spendingBreakdown, totalIncome, savings, needsTarget, wantsTarget, savingsTarget)
  }, [spendingBreakdown, totalIncome, savings, needsTarget, wantsTarget, savingsTarget])

  const isLoading = !transactions

  return (
    <div className="min-h-screen p-8">
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-xl border border-white/10 p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-500/20 rounded-xl shadow-lg shadow-red-500/30">
                <TrendingDown className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Spending</p>
                <p className="text-2xl font-bold">{isLoading ? '...' : formatCurrency(totalSpending)}</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass rounded-xl border border-white/10 p-6 shadow-lg">
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

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass rounded-xl border border-white/10 p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-500/20 rounded-xl shadow-lg shadow-blue-500/30">
                <PieChart className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Categories Tracked</p>
                <p className="text-2xl font-bold">{isLoading ? '...' : categoriesCount}</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Essential vs Discretionary Spending */}
        <motion.div 
          className="glass p-6 rounded-xl border border-white/10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <h3 className="text-lg font-semibold text-white mb-4">50/30/20 Budget Rule Analysis</h3>
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
                  {spendingChartData.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm text-gray-300">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Needs Card (50%) */}
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <ShieldCheck className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">Needs (50%)</p>
                    <p className="text-xs text-gray-400">Housing, Healthcare, Food, etc.</p>
                  </div>
                </div>
                <p className="text-2xl font-bold text-blue-400 mb-2">
                  {formatCurrency(spendingBreakdown?.essential || 0)}
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Current</span>
                    <span className={budgetRuleMetrics?.isOverspendingEssential ? 'text-red-400' : 'text-green-400'}>
                      {formatPercent(budgetRuleMetrics?.essentialPercent || 0)}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(budgetRuleMetrics?.essentialPercent || 0, 100)}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                      style={{
                        backgroundColor: budgetRuleMetrics?.isOverspendingEssential ? SEMANTIC_COLORS.expense : SPENDING_TYPE_COLORS.essential,
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-500">Target: ≤50% of income</p>
                </div>
              </div>

              {/* Wants Card (30%) */}
              <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-orange-500/20 rounded-lg">
                    <Sparkles className="w-5 h-5 text-orange-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">Wants (30%)</p>
                    <p className="text-xs text-gray-400">Entertainment, Shopping, etc.</p>
                  </div>
                </div>
                <p className="text-2xl font-bold text-orange-400 mb-2">
                  {formatCurrency(spendingBreakdown?.discretionary || 0)}
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Current</span>
                    <span className={budgetRuleMetrics?.isOverspendingDiscretionary ? 'text-red-400' : 'text-green-400'}>
                      {formatPercent(budgetRuleMetrics?.discretionaryPercent || 0)}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(budgetRuleMetrics?.discretionaryPercent || 0, 100)}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.4 }}
                      style={{
                        backgroundColor: budgetRuleMetrics?.isOverspendingDiscretionary ? SEMANTIC_COLORS.expense : SPENDING_TYPE_COLORS.discretionary,
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-500">Target: ≤30% of income</p>
                </div>
              </div>

              {/* Savings Card (20%) */}
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <PiggyBank className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">Savings (20%)</p>
                    <p className="text-xs text-gray-400">Income minus Expenses</p>
                  </div>
                </div>
                <p className="text-2xl font-bold text-emerald-400 mb-2">
                  {formatCurrency(savings)}
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Current</span>
                    <span className={budgetRuleMetrics?.isUnderSaving ? 'text-red-400' : 'text-green-400'}>
                      {formatPercent(budgetRuleMetrics?.savingsPercent || 0)}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(budgetRuleMetrics?.savingsPercent || 0, 100)}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.5 }}
                      style={{
                        backgroundColor: budgetRuleMetrics?.isUnderSaving ? SEMANTIC_COLORS.expense : SAVINGS_COLOR,
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-500">Target: ≥20% of income</p>
                </div>
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
        </motion.div>

        {/* Advanced Analytics */}
        <ExpenseTreemap />
        
        <MultiCategoryTimeAnalysis />

        {/* Year-over-Year & Recurring */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <YearOverYearComparison />
          <RecurringTransactions />
        </div>

        {/* Top Merchants */}
        <TopMerchants />

        {/* Subcategory Deep-Dive */}
        <EnhancedSubcategoryAnalysis />
      </div>
    </div>
  )
}
