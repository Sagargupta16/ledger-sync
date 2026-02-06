import { motion } from 'framer-motion'
import { TrendingUp, PieChart, DollarSign, LineChart } from 'lucide-react'
import { useMemo } from 'react'
import { useAccountBalances } from '@/hooks/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Tooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts'
import { formatCurrency, formatCurrencyShort, formatPercent } from '@/lib/formatters'
import EmptyState from '@/components/shared/EmptyState'

// 4 Investment Categories with colors
const INVESTMENT_CATEGORIES = ['FD/Bonds', 'Mutual Funds', 'PPF/EPF', 'Stocks'] as const
type InvestmentCategory = typeof INVESTMENT_CATEGORIES[number]

const CATEGORY_COLORS: Record<InvestmentCategory, string> = {
  'FD/Bonds': '#ec4899',      // Pink
  'Mutual Funds': '#8b5cf6',  // Purple
  'PPF/EPF': '#f59e0b',       // Amber
  'Stocks': '#10b981',        // Green
}

// Map investment types from preferences to our 4 categories
// Handles both raw values (stocks, mutual_funds) and formatted names (Stocks, Mutual Funds)
const mapToCategory = (investmentType: string): InvestmentCategory => {
  const type = investmentType.toLowerCase().replace(/[_\s]/g, '')
  
  // Check for stocks (handles: stocks, stock, equity, share, demat, rsu)
  if (type === 'stocks' || type === 'stock' || type.includes('equity') || type.includes('share') || type.includes('demat') || type.includes('rsu')) {
    return 'Stocks'
  }
  
  // Check for FD/Bonds (handles: fixed_deposits, fd, bonds, deposit)
  if (type === 'fixeddeposits' || type === 'fd' || type.includes('bond') || type.includes('deposit')) {
    return 'FD/Bonds'
  }
  
  // Check for PPF/EPF (handles: ppf_epf, ppf, epf, provident, nps, pension)
  if (type === 'ppfepf' || type === 'ppf' || type === 'epf' || type.includes('provident') || type.includes('nps') || type.includes('pension')) {
    return 'PPF/EPF'
  }
  
  // Check for Mutual Funds (handles: mutual_funds, mutualfunds, mf, fund)
  if (type === 'mutualfunds' || type === 'mf' || type.includes('fund') || type.includes('mutual')) {
    return 'Mutual Funds'
  }
  
  // Default to Mutual Funds for other investments
  return 'Mutual Funds'
}

export default function InvestmentAnalyticsPage() {
  const { isLoading: balancesLoading } = useAccountBalances()
  const { data: transactions = [] } = useTransactions()
  const { data: preferences, isLoading: preferencesLoading } = usePreferences()

  // Get investment accounts from user preferences (investment_account_mappings)
  const investmentMappings = useMemo(() => preferences?.investment_account_mappings || {}, [preferences?.investment_account_mappings])
  const investmentAccounts = useMemo(() => Object.keys(investmentMappings), [investmentMappings])

  const isLoading = balancesLoading || preferencesLoading

  // Map accounts to categories - use raw value from preferences for accurate mapping
  const accountToCategory = useMemo(() => {
    const mapping: Record<string, InvestmentCategory> = {}
    Object.entries(investmentMappings).forEach(([accountName, rawType]) => {
      mapping[accountName] = mapToCategory(rawType as string)
    })
    return mapping
  }, [investmentMappings])

  // Calculate investment totals (NET = IN - OUT)
  const filteredInvestmentTotals = useMemo(() => {
    if (!transactions.length || !investmentAccounts.length) {
      return { byAccount: {} as Record<string, number>, byCategory: {} as Record<InvestmentCategory, number>, total: 0 }
    }
    
    const byAccount: Record<string, number> = {}
    investmentAccounts.forEach(acc => {
      byAccount[acc] = 0
    })
    
    const byCategory: Record<InvestmentCategory, number> = {
      'FD/Bonds': 0,
      'Mutual Funds': 0,
      'PPF/EPF': 0,
      'Stocks': 0,
    }
    
    // Calculate NET investments (IN - OUT)
    transactions.forEach(tx => {
      // Transfers TO investment accounts (ADD)
      if (tx.type === 'Transfer' && investmentAccounts.includes(tx.to_account || '')) {
        const toAccount = tx.to_account || ''
        byAccount[toAccount] = (byAccount[toAccount] || 0) + tx.amount
        const category = accountToCategory[toAccount] || 'Mutual Funds'
        byCategory[category] += tx.amount
      }
      // Transfers FROM investment accounts (SUBTRACT)
      if (tx.type === 'Transfer' && investmentAccounts.includes(tx.from_account || '')) {
        const fromAccount = tx.from_account || ''
        byAccount[fromAccount] = (byAccount[fromAccount] || 0) - tx.amount
        const category = accountToCategory[fromAccount] || 'Mutual Funds'
        byCategory[category] -= tx.amount
      }
      // Income on investment accounts (dividends, interest) - ADD
      if (tx.type === 'Income' && investmentAccounts.includes(tx.account || '')) {
        const account = tx.account || ''
        byAccount[account] = (byAccount[account] || 0) + tx.amount
        const category = accountToCategory[account] || 'Mutual Funds'
        byCategory[category] += tx.amount
      }
      // Expenses on investment accounts - SUBTRACT
      if (tx.type === 'Expense' && investmentAccounts.includes(tx.account || '')) {
        const account = tx.account || ''
        byAccount[account] = (byAccount[account] || 0) - tx.amount
        const category = accountToCategory[account] || 'Mutual Funds'
        byCategory[category] -= tx.amount
      }
    })
    
    const total = Object.values(byCategory).reduce((sum, val) => sum + val, 0)
    
    return { byAccount, byCategory, total }
  }, [transactions, investmentAccounts, accountToCategory])

  // Calculate portfolio metrics - use filtered totals
  const totalInvestmentValue = filteredInvestmentTotals.total
  
  // Simple return calculation based on category breakdown of income
  const investmentReturns = totalInvestmentValue * 0.05 // Assume 5% average returns

  // Group by 4 investment categories - based on filtered data
  const investmentTypeBreakdown = useMemo(() => {
    const breakdown = filteredInvestmentTotals.byCategory
    
    return INVESTMENT_CATEGORIES
      .filter(cat => breakdown[cat] > 0)
      .map(name => ({
        name,
        value: breakdown[name],
        color: CATEGORY_COLORS[name],
        percentage: totalInvestmentValue > 0 ? ((breakdown[name] / totalInvestmentValue) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => b.value - a.value)
  }, [filteredInvestmentTotals, totalInvestmentValue])

  // Prepare pie chart data (individual accounts) - based on filtered data
  const portfolioData = useMemo(() => {
    return Object.entries(filteredInvestmentTotals.byAccount)
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({
        name,
        value,
        balance: value,
        investmentType: accountToCategory[name] || 'Mutual Funds',
        percentage: totalInvestmentValue > 0 ? (value / totalInvestmentValue * 100).toFixed(1) : '0',
      }))
  }, [filteredInvestmentTotals, accountToCategory, totalInvestmentValue])

  // Asset allocation based on filtered data
  const assetAllocation = investmentTypeBreakdown

  // Calculate monthly portfolio value growth by category
  // This shows NET INVESTMENTS (IN - OUT) over time
  const monthlyGrowthData = useMemo(() => {
    if (!transactions.length || !investmentAccounts.length) return []
    
    // Filter for all investment transactions (both IN and OUT)
    const investmentTransactions = transactions
      .filter(tx => {
        // Transfers TO investment accounts (SIP, deposits, purchases)
        if (tx.type === 'Transfer' && investmentAccounts.includes(tx.to_account || '')) {
          return true
        }
        // Transfers FROM investment accounts (withdrawals, sales)
        if (tx.type === 'Transfer' && investmentAccounts.includes(tx.from_account || '')) {
          return true
        }
        // Income on investment accounts (dividends, interest)
        if (tx.type === 'Income' && investmentAccounts.includes(tx.account || '')) {
          return true
        }
        // Expenses on investment accounts
        if (tx.type === 'Expense' && investmentAccounts.includes(tx.account || '')) {
          return true
        }
        return false
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    
    if (investmentTransactions.length === 0) return []
    
    // Track NET investment per account
    const accountInvestments: Record<string, number> = {}
    investmentAccounts.forEach(acc => {
      accountInvestments[acc] = 0
    })
    
    // Track at end of each month
    const monthlySnapshots: Array<{ month: string, investments: Record<string, number> }> = []
    let currentMonth = ''
    
    investmentTransactions.forEach(tx => {
      const date = new Date(tx.date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      
      const amount = tx.amount
      
      // Save previous month before processing new month's first transaction
      if (monthKey !== currentMonth && currentMonth !== '') {
        monthlySnapshots.push({
          month: currentMonth,
          investments: { ...accountInvestments }
        })
      }
      currentMonth = monthKey
      
      // Add inflows
      if (tx.type === 'Transfer' && investmentAccounts.includes(tx.to_account || '')) {
        const toAccount = tx.to_account || 'Unknown'
        accountInvestments[toAccount] += amount
      }
      // Subtract outflows
      if (tx.type === 'Transfer' && investmentAccounts.includes(tx.from_account || '')) {
        const fromAccount = tx.from_account || 'Unknown'
        accountInvestments[fromAccount] -= amount
      }
      // Add income
      if (tx.type === 'Income' && investmentAccounts.includes(tx.account || '')) {
        const account = tx.account || 'Unknown'
        accountInvestments[account] += amount
      }
      // Subtract expenses
      if (tx.type === 'Expense' && investmentAccounts.includes(tx.account || '')) {
        const account = tx.account || 'Unknown'
        accountInvestments[account] -= amount
      }
    })
    
    // Add final month
    if (currentMonth) {
      monthlySnapshots.push({
        month: currentMonth,
        investments: { ...accountInvestments }
      })
    }
    
    if (monthlySnapshots.length === 0) return []
    
    const firstMonth = monthlySnapshots[0].month
    const lastMonth = monthlySnapshots[monthlySnapshots.length - 1].month
    
    // Generate all months in range
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
    
    // Build chart data grouped by category
    const snapshotMap = new Map(monthlySnapshots.map(s => [s.month, s.investments]))
    const lastKnown: Record<string, number> = {}
    investmentAccounts.forEach(acc => {
      lastKnown[acc] = 0
    })
    
    const chartData = allMonths.map(month => {
      const [yearStr, monthNum] = month.split('-')
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const displayMonth = `${monthNames[parseInt(monthNum) - 1]} ${yearStr.slice(2)}`
      
      const dataPoint: Record<string, string | number> = { month: displayMonth, fullMonth: month }
      
      const snapshot = snapshotMap.get(month)
      
      // Update lastKnown from snapshot if available
      if (snapshot) {
        investmentAccounts.forEach(account => {
          lastKnown[account] = snapshot[account] || lastKnown[account]
        })
      }
      
      // Aggregate by category
      const categoryTotals: Record<InvestmentCategory, number> = {
        'FD/Bonds': 0,
        'Mutual Funds': 0,
        'PPF/EPF': 0,
        'Stocks': 0,
      }
      
      investmentAccounts.forEach(account => {
        const category = accountToCategory[account] || 'Mutual Funds'
        categoryTotals[category] += lastKnown[account]
      })
      
      // Add each category to the data point (always >= 0)
      INVESTMENT_CATEGORIES.forEach(cat => {
        dataPoint[cat] = Math.max(0, categoryTotals[cat])
      })
      
      return dataPoint
    })
    
    return chartData
  }, [transactions, investmentAccounts, accountToCategory])

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
          <p className="text-muted-foreground mt-2">Track your collective investment portfolio</p>
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
                  label={({ name, payload }) => `${name} (${payload.percentage}%)`}
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
                    backgroundColor: 'rgba(17,24,39,0.95)',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    borderRadius: '12px',
                    backdropFilter: 'blur(12px)',
                    color: '#ffffff',
                  }}
                  labelStyle={{
                    color: '#ffffff',
                  }}
                  itemStyle={{
                    color: '#ffffff',
                  }}
                  formatter={(value: number | undefined) => value !== undefined ? formatCurrency(value) : ''}
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
                    {INVESTMENT_CATEGORIES.map((category) => (
                      <linearGradient key={`gradient-${category}`} id={`color-${category.replace(/[\s/]/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CATEGORY_COLORS[category]} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={CATEGORY_COLORS[category]} stopOpacity={0.2}/>
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
                      backgroundColor: 'rgba(17,24,39,0.95)',
                      border: '1px solid rgba(139, 92, 246, 0.2)',
                      borderRadius: '12px',
                      backdropFilter: 'blur(12px)',
                      color: '#fff',
                    }}
                    labelStyle={{ color: '#9ca3af' }}
                    itemStyle={{ color: '#fff' }}
                    formatter={(value: number | undefined, name: string | undefined) => [
                      value !== undefined ? formatCurrency(value) : '',
                      name || ''
                    ]}
                    labelFormatter={(label) => `Month: ${label}`}
                  />
                  <Legend />
                  {INVESTMENT_CATEGORIES.map((category) => (
                    <Area 
                      key={category}
                      type="monotone" 
                      dataKey={category}
                      stackId="1"
                      stroke={CATEGORY_COLORS[category]} 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill={`url(#color-${category.replace(/[\s/]/g, '-')})`}
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
