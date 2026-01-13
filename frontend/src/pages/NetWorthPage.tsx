import { motion } from 'framer-motion'
import { TrendingUp, PiggyBank, CreditCard, BarChart3 } from 'lucide-react'
import { useAccountBalances, useMonthlyAggregation } from '@/hooks/useAnalytics'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

export default function NetWorthPage() {
  const { data: balanceData, isLoading: balancesLoading } = useAccountBalances()
  const { data: aggregationData, isLoading: aggregationLoading } = useMonthlyAggregation()

  const isLoading = balancesLoading || aggregationLoading

  // Calculate totals from balance data
  const accounts = balanceData?.accounts || {}
  const totalAssets = Object.values(accounts)
    .filter((acc: { balance: number; transaction_count: number }) => acc.balance > 0)
    .reduce((sum: number, acc: { balance: number; transaction_count: number }) => sum + acc.balance, 0)
  const totalLiabilities = Math.abs(
    Object.values(accounts)
      .filter((acc: { balance: number; transaction_count: number }) => acc.balance < 0)
      .reduce((sum: number, acc: { balance: number; transaction_count: number }) => sum + acc.balance, 0),
  )
  const netWorth = totalAssets - totalLiabilities

  // Format monthly data for area chart
  const monthlyNetWorth = Object.entries(aggregationData || {})
    .map(([month, data]: [string, { income: number; expense: number }]) => ({
      month,
      netWorth: data.income - data.expense,
      income: data.income,
      expenses: data.expense,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12)

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent drop-shadow-lg">
            Net Worth Tracker
          </h1>
          <p className="text-muted-foreground mt-2">Track your assets and liabilities over time</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-500/20 rounded-xl shadow-lg shadow-green-500/30">
                <PiggyBank className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Assets</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : `₹${totalAssets.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-500/20 rounded-xl shadow-lg shadow-red-500/30">
                <CreditCard className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Liabilities</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : `₹${totalLiabilities.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
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
              <div className="p-3 bg-primary/20 rounded-xl shadow-lg shadow-primary/30">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Net Worth</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : `₹${netWorth.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <div className="flex items-center gap-3 mb-6">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Net Worth Trend (Last 12 Months)</h3>
          </div>
          {isLoading ? (
            <div className="h-80 flex items-center justify-center">
              <div className="animate-pulse text-gray-400">Loading chart...</div>
            </div>
          ) : monthlyNetWorth.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={monthlyNetWorth}>
                <defs>
                  <linearGradient id="colorNetWorth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                <Area
                  type="monotone"
                  dataKey="netWorth"
                  stroke="#8b5cf6"
                  fillOpacity={1}
                  fill="url(#colorNetWorth)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-80 flex items-center justify-center text-gray-400">No data available</div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <h3 className="text-lg font-semibold text-white mb-6">Account Breakdown</h3>
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Loading accounts...</div>
          ) : Object.keys(accounts).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Account</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Balance</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Type</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Transactions</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(accounts)
                    .sort((a: [string, { balance: number; transaction_count: number }], b: [string, { balance: number; transaction_count: number }]) => Math.abs(b[1].balance) - Math.abs(a[1].balance))
                    .map(([accountName, accountData]: [string, { balance: number; transaction_count: number }]) => (
                      <motion.tr
                        key={accountName}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <td className="py-3 px-4 text-white font-medium">{accountName}</td>
                        <td
                          className={`py-3 px-4 text-right font-bold ${
                            accountData.balance > 0 ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          ₹{Math.abs(accountData.balance).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-400">
                          {accountData.balance > 0 ? 'Asset' : 'Liability'}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-400">{accountData.transactions}</td>
                      </motion.tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">No accounts found</div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
