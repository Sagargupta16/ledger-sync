import { motion } from 'framer-motion'
import { TrendingUp, DollarSign, Activity, PieChart, BarChart3 } from 'lucide-react'
import { useCategoryBreakdown, useMonthlyTrends } from '@/hooks/useAnalytics'
import { ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts'
import { useState } from 'react'

const COLORS = ['#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b']

export default function IncomeAnalysisPage() {
  const [timeRange, setTimeRange] = useState<'last_6_months' | 'last_12_months' | 'all_time'>('last_12_months')
  const { data: incomeData, isLoading: incomeLoading } = useCategoryBreakdown({ transaction_type: 'income' })
  const { data: trendsData, isLoading: trendsLoading } = useMonthlyTrends(timeRange)

  const totalIncome = incomeData?.total || 0
  const topSource = Object.entries(incomeData?.categories || {}).sort((a, b) => b[1].total - a[1].total)[0]?.[0] || 'N/A'

  // Calculate growth rate from monthly trends
  const monthlyIncomes = trendsData?.data?.map((d: { income: number }) => d.income) || []
  const growthRate = monthlyIncomes.length > 1
    ? ((monthlyIncomes[monthlyIncomes.length - 1] - monthlyIncomes[0]) / monthlyIncomes[0] * 100)
    : 0

  const pieData = Object.entries(incomeData?.categories || {})
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, data]) => ({ name, value: data.total, percentage: data.percentage }))

  const isLoading = incomeLoading || trendsLoading

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent drop-shadow-lg">
            Income Analysis
          </h1>
          <p className="text-muted-foreground mt-2">Track income sources and trends</p>
        </motion.div>

        <motion.div className="flex gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          {(['last_6_months', 'last_12_months', 'all_time'] as const).map((range) => (
            <button key={range} onClick={() => setTimeRange(range)} type="button" className={`px-4 py-2 rounded-lg transition-all ${timeRange === range ? 'glass-strong text-purple-400 border border-purple-500/30' : 'glass text-gray-400 hover:text-gray-300'}`}>
              {range === 'last_6_months' && 'Last 6 Months'}
              {range === 'last_12_months' && 'Last 12 Months'}
              {range === 'all_time' && 'All Time'}
            </button>
          ))}
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-xl border border-white/10 p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-500/20 rounded-xl shadow-lg shadow-green-500/30">
                <DollarSign className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Income</p>
                <p className="text-2xl font-bold">{isLoading ? '...' : `₹${totalIncome.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass rounded-xl border border-white/10 p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/20 rounded-xl shadow-lg shadow-primary/30">
                <Activity className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Primary Source</p>
                <p className="text-2xl font-bold">{isLoading ? '...' : topSource}</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass rounded-xl border border-white/10 p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-500/20 rounded-xl shadow-lg shadow-blue-500/30">
                <TrendingUp className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Growth Rate</p>
                <p className="text-2xl font-bold">{isLoading ? '...' : `${growthRate > 0 ? '+' : ''}${growthRate.toFixed(1)}%`}</p>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div className="glass p-6 rounded-xl border border-white/10" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}>
            <div className="flex items-center gap-3 mb-6">
              <PieChart className="w-5 h-5 text-green-400" />
              <h3 className="text-lg font-semibold text-white">Income Sources</h3>
            </div>
            {isLoading ? (
              <div className="h-80 flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading chart...</div></div>
            ) : pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <RechartsPie>
                  <Pie data={pieData} cx="50%" cy="50%" labelLine={false} label={({ name, percentage }) => `${name} (${percentage.toFixed(1)}%)`} outerRadius={100} fill="#8884d8" dataKey="value">
                    {pieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.95)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px' }} formatter={(value: number) => `₹${value.toLocaleString('en-IN')}`} />
                  <Legend />
                </RechartsPie>
              </ResponsiveContainer>
            ) : (<div className="h-80 flex items-center justify-center text-gray-400">No income data available</div>)}
          </motion.div>

          <motion.div className="glass p-6 rounded-xl border border-white/10" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 }}>
            <div className="flex items-center gap-3 mb-6">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Income Trend</h3>
            </div>
            {isLoading ? (
              <div className="h-80 flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading chart...</div></div>
            ) : trendsData?.data && trendsData.data.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={trendsData.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="month" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.95)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px' }} formatter={(value: number) => `₹${value.toLocaleString('en-IN')}`} />
                  <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (<div className="h-80 flex items-center justify-center text-gray-400">No trend data available</div>)}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
