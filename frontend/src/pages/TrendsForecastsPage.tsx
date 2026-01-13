import { motion } from 'framer-motion'
import { TrendingUp, Activity, Zap, LineChart } from 'lucide-react'
import { useTrends } from '@/hooks/useAnalytics'
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { useState } from 'react'

export default function TrendsForecastsPage() {
  const [timeRange, setTimeRange] = useState<'last_6_months' | 'last_12_months'>('last_12_months')
  const { data: trendsData, isLoading } = useTrends(timeRange)

  // Get latest month data for stats
  const latestMonth = trendsData?.monthly_trends?.[trendsData.monthly_trends.length - 1]
  const previousMonth = trendsData?.monthly_trends?.[trendsData.monthly_trends.length - 2]

  // Calculate spending forecast (simple linear trend)
  const spendingForecast = latestMonth
    ? (
        latestMonth.expenses +
        ((latestMonth.expenses - (previousMonth?.expenses || latestMonth.expenses)) /
          (previousMonth?.expenses || latestMonth.expenses)) *
          latestMonth.expenses
      ).toFixed(0)
    : '0'

  // Calculate recurring patterns from consistency score
  const consistencyScore = trendsData?.consistency_score || 0
  const recurringPct = (consistencyScore * 100).toFixed(1)

  // Calculate confidence score based on data consistency
  const confidenceScore = Math.min(100, (consistencyScore * 100 + 20).toFixed(0))

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent drop-shadow-lg">
            Trends & Forecasts
          </h1>
          <p className="text-muted-foreground mt-2">Predict future spending and income patterns</p>
        </motion.div>

        <motion.div className="flex gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          {(['last_6_months', 'last_12_months'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              type="button"
              className={`px-4 py-2 rounded-lg transition-all ${
                timeRange === range
                  ? 'glass-strong text-purple-400 border border-purple-500/30'
                  : 'glass text-gray-400 hover:text-gray-300'
              }`}
            >
              {range === 'last_6_months' && 'Last 6 Months'}
              {range === 'last_12_months' && 'Last 12 Months'}
            </button>
          ))}
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/20 rounded-xl shadow-lg shadow-primary/30">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Spending Forecast</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : `₹${parseFloat(spendingForecast).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-500/20 rounded-xl shadow-lg shadow-blue-500/30">
                <Activity className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Recurring Patterns</p>
                <p className="text-2xl font-bold">{isLoading ? '...' : `${recurringPct}%`}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-500/20 rounded-xl shadow-lg shadow-purple-500/30">
                <Zap className="w-6 h-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Confidence Score</p>
                <p className="text-2xl font-bold">{isLoading ? '...' : `${confidenceScore}%`}</p>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <div className="flex items-center gap-3 mb-6">
            <LineChart className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Income vs Expense Trends</h3>
          </div>
          {isLoading ? (
            <div className="h-80 flex items-center justify-center">
              <div className="animate-pulse text-gray-400">Loading chart...</div>
            </div>
          ) : trendsData?.monthly_trends && trendsData.monthly_trends.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={trendsData.monthly_trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="month" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => `₹${value.toLocaleString('en-IN')}`}
                />
                <Legend />
                <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="surplus" stroke="#8b5cf6" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-80 flex items-center justify-center text-gray-400">No data available</div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <h3 className="text-lg font-semibold text-white mb-6">Monthly Summary</h3>
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Loading data...</div>
          ) : trendsData?.monthly_trends && trendsData.monthly_trends.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Month</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Income</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Expenses</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Surplus</th>
                  </tr>
                </thead>
                <tbody>
                  {trendsData.monthly_trends.slice(-6).map((trend, index) => (
                    <motion.tr
                      key={trend.month}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 + index * 0.05 }}
                    >
                      <td className="py-3 px-4 text-white font-medium">{trend.month}</td>
                      <td className="py-3 px-4 text-right text-green-400">₹{trend.income.toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4 text-right text-red-400">₹{trend.expenses.toLocaleString('en-IN')}</td>
                      <td
                        className={`py-3 px-4 text-right font-bold ${
                          trend.surplus > 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        ₹{trend.surplus.toLocaleString('en-IN')}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">No data available</div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
