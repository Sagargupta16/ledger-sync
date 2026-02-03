import { motion } from 'framer-motion'
import { TrendingUp, PieChart, DollarSign, LineChart } from 'lucide-react'
import { useMemo } from 'react'
import { useAccountBalances } from '@/hooks/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Tooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts'
import { formatCurrency, formatCurrencyShort, formatPercent, formatAccountType } from '@/lib/formatters'
import { INCOME_COLORS } from '@/constants/chartColors'
import EmptyState from '@/components/shared/EmptyState'

const COLORS = [...INCOME_COLORS, '#f97316', '#14b8a6']

// Investment type colors - using display names as keys
const INVESTMENT_TYPE_COLORS: Record<string, string> = {
  'Stocks': '#10b981',
  'Mutual Funds': '#8b5cf6',
  'PPF / EPF': '#f59e0b',
  'PPF': '#f59e0b',
  'NPS': '#06b6d4',
  'Fixed Deposits': '#ec4899',
  'FD': '#ec4899',
  'EPF': '#14b8a6',
  'Gold': '#eab308',
  'Bonds': '#6366f1',
  'Real Estate': '#84cc16',
  'Crypto': '#f97316',
  'Other Investments': '#6b7280',
  'Other': '#6b7280',
}

export default function InvestmentAnalyticsPage() {
  const { data: balanceData, isLoading: balancesLoading } = useAccountBalances()
  const { data: transactions = [] } = useTransactions()
  const { data: preferences, isLoading: preferencesLoading } = usePreferences()

  // Get investment accounts from user preferences (investment_account_mappings)
  const investmentMappings = preferences?.investment_account_mappings || {}
  const investmentAccounts = Object.keys(investmentMappings)

  const isLoading = balancesLoading || preferencesLoading

  // Filter accounts based on user selection
  const accounts = balanceData?.accounts || {}
  
  const selectedInvestmentAccounts = Object.entries(accounts)
    .filter(([name]) => investmentAccounts.includes(name))
    .map(([name, data]: [string, { balance?: number }]) => ({
      name,
      value: Math.abs(data.balance || 0),
      balance: data.balance || 0,
      investmentType: formatAccountType(investmentMappings[name] || 'Other'),
    }))
    .filter((acc) => acc.value > 0)

  // Calculate portfolio metrics
  const totalInvestmentValue = selectedInvestmentAccounts.reduce((sum, acc) => sum + acc.value, 0)
  
  // Simple return calculation based on category breakdown of income
  const investmentReturns = totalInvestmentValue * 0.05 // Assume 5% average returns

  // Group by investment type (from user preferences)
  const investmentTypeBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {}
    
    selectedInvestmentAccounts.forEach((acc) => {
      const type = acc.investmentType
      breakdown[type] = (breakdown[type] || 0) + acc.value
    })
    
    return Object.entries(breakdown)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({
        name,
        value,
        color: INVESTMENT_TYPE_COLORS[name] || INVESTMENT_TYPE_COLORS['Other'],
        percentage: totalInvestmentValue > 0 ? ((value / totalInvestmentValue) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => b.value - a.value)
  }, [selectedInvestmentAccounts, totalInvestmentValue])

  // Prepare pie chart data (individual accounts)
  const portfolioData = selectedInvestmentAccounts
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
    .map((acc) => ({
      name: acc.name, // Use full account name
      value: acc.value,
      balance: acc.balance,
      investmentType: acc.investmentType,
      percentage: totalInvestmentValue > 0 ? (acc.value / totalInvestmentValue * 100).toFixed(1) : '0',
    }))

  // Asset allocation based on user preferences (investmentTypeBreakdown already calculated above)
  const assetAllocation = investmentTypeBreakdown

  // Calculate monthly portfolio value growth per account
  const monthlyGrowthData = useMemo(() => {
    if (!transactions.length || !investmentAccounts.length) return []
    
    // Filter and sort transactions chronologically
    // Include transactions where account is an investment account OR to_account is an investment account
    const investmentTransactions = transactions
      .filter(tx => 
        investmentAccounts.includes(tx.account || '') || 
        investmentAccounts.includes(tx.to_account || '')
      )
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    
    if (investmentTransactions.length === 0) return []
    
    // Track running balance per account
    const accountBalances: Record<string, number> = {}
    investmentAccounts.forEach(acc => {
      accountBalances[acc] = 0
    })
    
    // Track balance at end of each month
    const monthlySnapshots: Array<{ month: string, balances: Record<string, number> }> = []
    let currentMonth = ''
    
    investmentTransactions.forEach(tx => {
      const date = new Date(tx.date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      
      // Update running balance - amounts are always positive in DB
      // Use transaction type to determine if we add or subtract
      const amount = tx.amount // Already positive
      
      // For investment accounts, we need to handle:
      // 1. Transfers FROM bank accounts TO investment accounts (buy/deposit)
      // 2. Transfers FROM investment accounts TO bank accounts (sell/withdrawal)
      // 3. Income/Expense transactions directly on investment accounts
      
      if (tx.type === 'Transfer' && investmentAccounts.includes(tx.to_account || '')) {
        // Money flowing TO investment account (SIP, deposit, buy)
        const toAccount = tx.to_account || 'Unknown'
        accountBalances[toAccount] += amount
      } else if (tx.type === 'Transfer' && investmentAccounts.includes(tx.from_account || '')) {
        // Money flowing FROM investment account (sale, withdrawal)
        const fromAccount = tx.from_account || 'Unknown'
        accountBalances[fromAccount] -= amount
      } else if (investmentAccounts.includes(tx.account || '')) {
        // Regular Income/Expense on investment account
        const account = tx.account || 'Unknown'
        if (tx.type === 'Income') {
          accountBalances[account] += amount
        } else if (tx.type === 'Expense') {
          accountBalances[account] -= amount
        }
      }
      
      // Save snapshot at end of each month
      if (monthKey !== currentMonth && currentMonth !== '') {
        monthlySnapshots.push({
          month: currentMonth,
          balances: { ...accountBalances }
        })
      }
      currentMonth = monthKey
    })
    
    // Add final month
    if (currentMonth) {
      monthlySnapshots.push({
        month: currentMonth,
        balances: { ...accountBalances }
      })
    }
    
    // Get all months and fill gaps
    if (monthlySnapshots.length === 0) return []
    
    const firstMonth = monthlySnapshots[0].month
    const lastMonth = monthlySnapshots[monthlySnapshots.length - 1].month
    
    const allMonths: string[] = []
    let [year, month] = firstMonth.split('-').map(Number)
    const [endYear, endMonth] = lastMonth.split('-').map(Number)
    
    while (year < endYear || (year === endYear && month <= endMonth)) {
      allMonths.push(`${year}-${String(month).padStart(2, '0')}`)
      month++
      if (month > 12) {
        month = 1
        year++
      }
    }
    
    // Build chart data
    const snapshotMap = new Map(monthlySnapshots.map(s => [s.month, s.balances]))
    const lastKnown: Record<string, number> = {}
    investmentAccounts.forEach(acc => {
      lastKnown[acc] = 0
    })
    
    const chartData = allMonths.map(month => {
      const [year, monthNum] = month.split('-')
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const displayMonth = `${monthNames[parseInt(monthNum) - 1]} ${year.slice(2)}`
      
      const dataPoint: Record<string, string | number> = { month: displayMonth, fullMonth: month }
      
      const snapshot = snapshotMap.get(month)
      
      investmentAccounts.forEach(account => {
        if (snapshot) {
          lastKnown[account] = snapshot[account] || 0
        }
        // Show actual balance including negatives
        dataPoint[account] = lastKnown[account]
      })
      
      return dataPoint
    })
    
    return chartData
  }, [transactions, investmentAccounts])

  if (totalInvestmentValue === 0) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent drop-shadow-lg">
              Investment Analytics
            </h1>
            <p className="text-muted-foreground mt-2">Track your investment portfolio and returns</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-xl border border-white/10 p-8 shadow-lg text-center"
          >
            <p className="text-muted-foreground mb-4">No investment accounts classified yet.</p>
            <p className="text-sm text-muted-foreground">
              Go to <a href="/settings" className="text-primary hover:underline">Settings</a> to classify your accounts as Investments.
            </p>
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent drop-shadow-lg">
            Investment Analytics
          </h1>
          <p className="text-muted-foreground mt-2">Track your investment portfolio and returns</p>
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
                <TrendingUp className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Investment Value</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : formatCurrency(totalInvestmentValue)}
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
              <div className="p-3 bg-blue-500/20 rounded-xl shadow-lg shadow-blue-500/30">
                <PieChart className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Portfolio Assets</p>
                <p className="text-2xl font-bold">{isLoading ? '...' : investmentAccounts.length}</p>
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
              <div className="p-3 bg-purple-500/20 rounded-xl shadow-lg shadow-purple-500/30">
                <DollarSign className="w-6 h-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Est. Returns (5%)</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : formatCurrency(investmentReturns)}
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <div className="flex items-center gap-3 mb-6">
            <PieChart className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Asset Allocation</h3>
          </div>
          {isLoading ? (
            <div className="h-80 flex items-center justify-center">
              <div className="animate-pulse text-gray-400">Loading chart...</div>
            </div>
          ) : assetAllocation.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <RechartsPie>
                <Pie
                  data={assetAllocation}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percentage }) => `${name} (${percentage}%)`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {assetAllocation.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '8px',
                    color: '#ffffff',
                  }}
                  labelStyle={{
                    color: '#ffffff',
                  }}
                  itemStyle={{
                    color: '#ffffff',
                  }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Legend />
              </RechartsPie>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={PieChart}
              title="No investment data"
              description="Configure your investment accounts in Settings to see asset allocation."
              actionLabel="Go to Settings"
              actionHref="/settings"
            />
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <div className="flex items-center gap-3 mb-6">
            <LineChart className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-white">Investment Growth Over Time</h3>
          </div>
          {isLoading ? (
            <div className="h-80 flex items-center justify-center">
              <div className="animate-pulse text-gray-400">Loading chart...</div>
            </div>
          ) : monthlyGrowthData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={monthlyGrowthData}>
                  <defs>
                    {investmentAccounts.map((account, index) => (
                      <linearGradient key={`gradient-${account}`} id={`color-${index}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.2}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis 
                    dataKey="month" 
                    stroke="#9ca3af" 
                    angle={-45} 
                    textAnchor="end" 
                    height={80}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    stroke="#9ca3af"
                    tickFormatter={(value) => formatCurrencyShort(value)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(17, 24, 39, 0.95)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                    labelStyle={{ color: '#9ca3af' }}
                    itemStyle={{ color: '#fff' }}
                    formatter={(value: number) => [formatCurrency(value), '']}
                    labelFormatter={(label) => `Month: ${label}`}
                  />
                  <Legend />
                  {investmentAccounts.map((account, index) => (
                    <Area 
                      key={account}
                      type="monotone" 
                      dataKey={account}
                      stackId="1"
                      stroke={COLORS[index % COLORS.length]} 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill={`url(#color-${index})`}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                icon={LineChart}
                title="No investment data"
                description="Add investment transactions to see growth over time."
                actionLabel="Upload Data"
                actionHref="/upload"
              />
            )}
        </motion.div>

        {portfolioData.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <h3 className="text-lg font-semibold text-white mb-6">Investment Accounts</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Account</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Value</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Allocation</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolioData.map((item, index) => (
                    <motion.tr
                      key={`${item.name}-${index}`}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 + index * 0.05 }}
                    >
                      <td className="py-3 px-4 text-white font-medium">{item.name}</td>
                      <td className="py-3 px-4 text-right text-green-400">{formatCurrency(item.value)}</td>
                      <td className="py-3 px-4 text-right text-purple-400">{formatPercent(Number.parseFloat(item.percentage))}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
