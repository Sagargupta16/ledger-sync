import { motion } from 'framer-motion'
import { TrendingDown, Tag, PieChart, Calendar, DollarSign } from 'lucide-react'
import { useCategoryBreakdown, useTrends } from '@/hooks/useAnalytics'
import { useState } from 'react'
import {
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'

const COLORS = ['#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#22c55e']

export default function SpendingAnalysisPage() {
  const [timeRange, setTimeRange] = useState<'all_time' | 'last_3_months' | 'last_6_months'>(
    'last_6_months',
  )

  const { data: categoryData, isLoading: categoriesLoading } = useCategoryBreakdown({
    transaction_type: 'expense',
  })
  const { data: trendsData, isLoading: trendsLoading } = useTrends(timeRange)

  const totalSpending = categoryData?.total || 0
  const categoriesCount = Object.keys(categoryData?.categories || {}).length
  const topCategory =
    Object.entries(categoryData?.categories || {}).sort((a, b) => b[1].total - a[1].total)[0]?.[0] ||
    'N/A'

  const pieData = Object.entries(categoryData?.categories || {})
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 8)
    .map(([name, data]) => ({
      name,
      value: data.total,
      percentage: data.percentage,
    }))

  const monthlyData = trendsData?.monthly_trends
    ?.slice(-6)
    .map((trend) => ({
      month: trend.month.substring(0, 7),
      expenses: trend.expenses,
    })) || []

  const isLoading = categoriesLoading || trendsLoading

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent drop-shadow-lg">
            Category Spending
          </h1>
          <p className="text-muted-foreground mt-2">Analyze spending patterns by category</p>
        </motion.div>

        <motion.div className="flex gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          {(['last_3_months', 'last_6_months', 'all_time'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              type="button"
              className={`px-4 py-2 rounded-lg transition-all ${timeRange === range
                  ? 'glass-strong text-purple-400 border border-purple-500/30'
                  : 'glass text-gray-400 hover:text-gray-300'
                }`}
            >
              {range === 'last_3_months' && 'Last 3 Months'}
              {range === 'last_6_months' && 'Last 6 Months'}
              {range === 'all_time' && 'All Time'}
            </button>
          ))}
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div className="glass p-6 rounded-xl border border-white/10" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}>
            <div className="flex items-center gap-3 mb-6">
              <PieChart className="w-5 h-5 text-purple-400" />
              <h3 className="text-lg font-semibold text-white">Category Distribution</h3>
            </div>
            {isLoading ? (
              <div className="h-80 flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading chart...</div></div>
            ) : pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <RechartsPie>
                  <Pie data={pieData} cx="50%" cy="50%" labelLine={false} label={({ name, percentage }) => `${name} (${percentage.toFixed(1)}%)`} outerRadius={100} fill="#8884d8" dataKey="value">
                    {pieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.95)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '8px', backdropFilter: 'blur(10px)' }} formatter={(value: number) => `₹${value.toLocaleString('en-IN')}`} />
                  <Legend />
                </RechartsPie>
              </ResponsiveContainer>
            ) : (<div className="h-80 flex items-center justify-center text-gray-400">No spending data available</div>)}
          </motion.div>

          <motion.div className="glass p-6 rounded-xl border border-white/10" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 }}>
            <div className="flex items-center gap-3 mb-6">
              <Calendar className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Monthly Spending Trend</h3>
            </div>
            {isLoading ? (
              <div className="h-80 flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading chart...</div></div>
            ) : monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="month" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.95)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '8px', backdropFilter: 'blur(10px)' }} formatter={(value: number) => `₹${value.toLocaleString('en-IN')}`} />
                  <Bar dataKey="expenses" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (<div className="h-80 flex items-center justify-center text-gray-400">No trend data available</div>)}
          </motion.div>
        </div>

        <motion.div className="glass p-6 rounded-xl border border-white/10" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
          <div className="flex items-center gap-3 mb-6">
            <DollarSign className="w-5 h-5 text-green-400" />
            <h3 className="text-lg font-semibold text-white">Category Breakdown</h3>
          </div>
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Loading categories...</div>
          ) : Object.keys(categoryData?.categories || {}).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Category</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Amount</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Percentage</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Transactions</th>
                </tr></thead>
                <tbody>
                  {Object.entries(categoryData?.categories || {}).sort((a, b) => b[1].total - a[1].total).map(([category, data], index) => (
                    <motion.tr key={category} className="border-b border-white/5 hover:bg-white/5 transition-colors" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 + index * 0.05 }}>
                      <td className="py-3 px-4 text-white font-medium">{category}</td>
                      <td className="py-3 px-4 text-right text-white">₹{data.total.toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4 text-right text-purple-400">{data.percentage.toFixed(1)}%</td>
                      <td className="py-3 px-4 text-right text-gray-400">{data.count}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (<div className="text-center py-8 text-gray-400">No categories found</div>)}
        </motion.div>
      </div>
    </div>
  )
}
