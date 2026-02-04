import { motion } from 'framer-motion'
import { TrendingDown, Tag, PieChart, ShieldCheck, Sparkles, PiggyBank } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useMemo, useState } from 'react'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Tooltip } from 'recharts'
import { calculateSpendingBreakdown, SPENDING_TYPE_COLORS } from '@/lib/preferencesUtils'
import { getCurrentYear, getCurrentMonth } from '@/lib/dateUtils'
import EmptyState from '@/components/shared/EmptyState'
import AnalyticsTimeFilter, { 
  type AnalyticsViewMode, 
  getCurrentFY, 
  getAnalyticsDateRange 
} from '@/components/shared/AnalyticsTimeFilter'
import {
  ExpenseTreemap,
  EnhancedSubcategoryAnalysis,
  MultiCategoryTimeAnalysis,
  YearOverYearComparison,
  RecurringTransactions,
  TopMerchants,
} from '@/components/analytics'

// Color for Savings
const SAVINGS_COLOR = '#10b981' // Green

export default function SpendingAnalysisPage() {
  const { data: transactions } = useTransactions()
  const { data: preferences } = usePreferences()
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4

  // Time filter state
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>('fy')
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [currentFY, setCurrentFY] = useState(getCurrentFY(fiscalYearStartMonth))

  // Get date range based on current filter
  const dateRange = useMemo(() => {
    return getAnalyticsDateRange(viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth)
  }, [viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth])

  // Filter transactions by date range
  const filteredTransactions = useMemo(() => {
    if (!transactions) return []
    if (!dateRange.start_date) return transactions
    
    return transactions.filter((t) => {
      return t.date >= dateRange.start_date! && (!dateRange.end_date || t.date <= dateRange.end_date)
    })
  }, [transactions, dateRange])

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
  const categoryBreakdown = useMemo(() => {
    const expenses = filteredTransactions.filter((t) => t.type === 'Expense')
    const categories: Record<string, number> = {}
    
    expenses.forEach((t) => {
      const category = t.category || 'Uncategorized'
      categories[category] = (categories[category] || 0) + Math.abs(t.amount)
    })
    
    return categories
  }, [filteredTransactions])

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

  // Calculate 50/30/20 rule metrics (based on income, not just expenses)
  const budgetRuleMetrics = useMemo(() => {
    if (!spendingBreakdown || totalIncome <= 0) return null
    
    // 50/30/20 rule is based on income: 50% needs, 30% wants, 20% savings
    const essentialPercent = (spendingBreakdown.essential / totalIncome) * 100
    const discretionaryPercent = (spendingBreakdown.discretionary / totalIncome) * 100
    const savingsPercent = (savings / totalIncome) * 100
    
    return {
      essentialPercent,
      discretionaryPercent,
      savingsPercent,
      essentialTarget: 50,
      discretionaryTarget: 30,
      savingsTarget: 20,
      isOverspendingEssential: essentialPercent > 55, // 5% buffer
      isOverspendingDiscretionary: discretionaryPercent > 35, // 5% buffer
      isUnderSaving: savingsPercent < 15, // 5% buffer below 20%
    }
  }, [spendingBreakdown, totalIncome, savings])

  const isLoading = !transactions

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent drop-shadow-lg">
              Category Spending
            </h1>
            <p className="text-muted-foreground mt-2">Analyze spending patterns by category</p>
          </div>
          <AnalyticsTimeFilter
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            currentYear={currentYear}
            currentMonth={currentMonth}
            currentFY={currentFY}
            onYearChange={setCurrentYear}
            onMonthChange={setCurrentMonth}
            onFYChange={setCurrentFY}
          />
        </motion.div>

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
                        {spendingChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{
                          background: 'rgba(0,0,0,0.9)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '8px',
                          color: '#fff',
                        }}
                        labelStyle={{ color: '#9ca3af' }}
                        itemStyle={{ color: '#fff' }}
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
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(budgetRuleMetrics?.essentialPercent || 0, 100)}%`,
                        backgroundColor: budgetRuleMetrics?.isOverspendingEssential ? '#ef4444' : SPENDING_TYPE_COLORS.essential,
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
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(budgetRuleMetrics?.discretionaryPercent || 0, 100)}%`,
                        backgroundColor: budgetRuleMetrics?.isOverspendingDiscretionary ? '#ef4444' : SPENDING_TYPE_COLORS.discretionary,
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
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(budgetRuleMetrics?.savingsPercent || 0, 100)}%`,
                        backgroundColor: budgetRuleMetrics?.isUnderSaving ? '#ef4444' : SAVINGS_COLOR,
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
