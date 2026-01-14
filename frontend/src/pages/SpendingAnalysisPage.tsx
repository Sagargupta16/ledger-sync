import { motion } from 'framer-motion'
import { TrendingDown, Tag, PieChart } from 'lucide-react'
import { useCategoryBreakdown } from '@/hooks/useAnalytics'
import ExpenseTreemap from '@/components/analytics/ExpenseTreemap'
import EnhancedSubcategoryAnalysis from '@/components/analytics/EnhancedSubcategoryAnalysis'
import MultiCategoryTimeAnalysis from '@/components/analytics/MultiCategoryTimeAnalysis'
import SubcategoryAnalysis from '@/components/analytics/SubcategoryAnalysis'

export default function SpendingAnalysisPage() {
  const { data: categoryData, isLoading: categoriesLoading } = useCategoryBreakdown({
    transaction_type: 'expense',
  })

  const totalSpending = categoryData?.total || 0
  const categoriesCount = Object.keys(categoryData?.categories || {}).length
  const topCategory =
    Object.entries(categoryData?.categories || {}).sort((a, b) => b[1].total - a[1].total)[0]?.[0] ||
    'N/A'

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
                <p className="text-2xl font-bold">{isLoading ? '...' : `₹${totalSpending.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}</p>
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

        {/* Advanced Analytics */}
        <ExpenseTreemap />
        
        <MultiCategoryTimeAnalysis />

        <EnhancedSubcategoryAnalysis />

        <SubcategoryAnalysis 
          categoryData={Object.entries(categoryData?.categories || {})
            .sort((a, b) => b[1].total - a[1].total)
            .map(([category, data]) => ({
              category,
              amount: data.total,
              percentage: data.percentage,
              subcategories: data.subcategories,
            }))
          }
        />
      </div>
    </div>
  )
}
