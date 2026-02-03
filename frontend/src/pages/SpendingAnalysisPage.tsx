import { motion } from 'framer-motion'
import { TrendingDown, Tag, PieChart, ShieldCheck, Sparkles } from 'lucide-react'
import { useCategoryBreakdown } from '@/hooks/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useMemo } from 'react'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Tooltip } from 'recharts'
import { calculateSpendingBreakdown, SPENDING_TYPE_COLORS } from '@/lib/preferencesUtils'
import EmptyState from '@/components/shared/EmptyState'
import {
  ExpenseTreemap,
  EnhancedSubcategoryAnalysis,
  MultiCategoryTimeAnalysis,
  YearOverYearComparison,
  RecurringTransactions,
  TopMerchants,
} from '@/components/analytics'

export default function SpendingAnalysisPage() {
  const { data: categoryData, isLoading: categoriesLoading } = useCategoryBreakdown({
    transaction_type: 'expense',
  })
  const { data: transactions } = useTransactions()
  const { data: preferences } = usePreferences()

  const totalSpending = categoryData?.total || 0
  const categoriesCount = Object.keys(categoryData?.categories || {}).length
  const topCategory =
    Object.entries(categoryData?.categories || {}).sort((a, b) => b[1].total - a[1].total)[0]?.[0] ||
    'N/A'

  // Calculate essential vs discretionary spending
  const spendingBreakdown = useMemo(() => {
    if (!transactions || !preferences) return null
    return calculateSpendingBreakdown(transactions, preferences.essential_categories)
  }, [transactions, preferences])

  // Prepare spending breakdown chart data
  const spendingChartData = useMemo(() => {
    if (!spendingBreakdown) return []
    return [
      { name: 'Essential', value: spendingBreakdown.essential, color: SPENDING_TYPE_COLORS.essential },
      { name: 'Discretionary', value: spendingBreakdown.discretionary, color: SPENDING_TYPE_COLORS.discretionary },
    ].filter((d) => d.value > 0)
  }, [spendingBreakdown])

  // Calculate 50/30/20 rule metrics
  const budgetRuleMetrics = useMemo(() => {
    if (!spendingBreakdown) return null
    const total = spendingBreakdown.total
    const essentialPercent = (spendingBreakdown.essential / total) * 100
    const discretionaryPercent = (spendingBreakdown.discretionary / total) * 100
    
    // 50/30/20 rule: 50% needs, 30% wants, 20% savings
    return {
      essentialPercent,
      discretionaryPercent,
      essentialTarget: 50,
      discretionaryTarget: 30,
      isOverspendingEssential: essentialPercent > 55, // 5% buffer
      isOverspendingDiscretionary: discretionaryPercent > 35, // 5% buffer
    }
  }, [spendingBreakdown])

  const isLoading = categoriesLoading

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent drop-shadow-lg">
            Category Spending
          </h1>
          <p className="text-muted-foreground mt-2">Analyze spending patterns by category</p>
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
          <h3 className="text-lg font-semibold text-white mb-4">Needs vs Wants Analysis</h3>
          {spendingChartData.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

              {/* Essential Spending Card */}
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <ShieldCheck className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">Essential (Needs)</p>
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
                  <p className="text-xs text-gray-500">Target: ≤50% of spending (50/30/20 rule)</p>
                </div>
              </div>

              {/* Discretionary Spending Card */}
              <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-orange-500/20 rounded-lg">
                    <Sparkles className="w-5 h-5 text-orange-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">Discretionary (Wants)</p>
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
                  <p className="text-xs text-gray-500">Target: ≤30% of spending (50/30/20 rule)</p>
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
