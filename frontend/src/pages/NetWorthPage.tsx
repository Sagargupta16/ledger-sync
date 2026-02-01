import { motion } from 'framer-motion'
import { TrendingUp, PiggyBank, CreditCard, BarChart3 } from 'lucide-react'
import { useAccountBalances, useMonthlyAggregation } from '@/hooks/useAnalytics'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { useState, useEffect } from 'react'
import React from 'react'
import { formatCurrency, formatPercent } from '@/lib/formatters'

export default function NetWorthPage() {
  const { data: balanceData, isLoading: balancesLoading } = useAccountBalances()
  const { data: aggregationData, isLoading: aggregationLoading } = useMonthlyAggregation()
  const [showStacked, setShowStacked] = useState(false)
  const [accountClassifications, setAccountClassifications] = useState<Record<string, string>>({})

  // Fetch account classifications
  useEffect(() => {
    fetch('/api/account-classifications')
      .then(res => res.json())
      .then(data => setAccountClassifications(data))
      .catch(err => console.error('Failed to fetch account classifications:', err))
  }, [])

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

  // Categorize accounts based on API classifications
  const categorizeAccount = (accountName: string) => {
    const classification = accountClassifications[accountName]
    const name = accountName.toLowerCase()
    
    // Lended category only for Fam, Flat, Friends
    if (name.includes('fam') || name.includes('flat') || name.includes('friend')) {
      return 'lended'
    }
    
    if (!classification) return 'other'
    
    // Map API classifications to chart categories
    switch (classification) {
      case 'Investments':
        return 'invested'
      case 'Bank Accounts':
      case 'Cash':
      case 'Other Wallets':
        return 'cashbank'
      case 'Credit Cards':
        return 'liability'
      default:
        return 'other'
    }
  }

  // Calculate category totals from current balances
  const categoryTotals = Object.entries(accounts).reduce((acc, [name, data]: [string, { balance: number; transaction_count: number }]) => {
    const category = categorizeAccount(name)
    if (!acc[category]) acc[category] = 0
    // Use absolute value since negative balances are assets
    acc[category] += Math.abs(data.balance)
    return acc
  }, {} as Record<string, number>)

  const totalPositive = totalAssets
  const categoryProportions = {
    cashbank: (categoryTotals.cashbank || 0) / totalPositive,
    invested: (categoryTotals.invested || 0) / totalPositive,
    lended: (categoryTotals.lended || 0) / totalPositive,
    other: (categoryTotals.other || 0) / totalPositive,
  }

  // Format monthly data for area chart with cumulative net worth
  const monthlyNetWorth = Object.entries(aggregationData || {})
    .map(([month, data]: [string, { income: number; expense: number }]) => ({
      month,
      monthlyFlow: data.income - data.expense,
      income: data.income,
      expenses: data.expense,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
  
  // Calculate cumulative values for net worth, income, and expenses
  const netWorthData = monthlyNetWorth.reduce((acc, item) => {
    const prevItem = acc[acc.length - 1]
    const cumulativeNetWorth = (prevItem?.netWorth || 0) + item.monthlyFlow
    const cumulativeIncome = (prevItem?.cumulativeIncome || 0) + item.income
    const cumulativeExpenses = (prevItem?.cumulativeExpenses || 0) + item.expenses
    
    // Calculate category breakdowns based on current proportions
    const positiveNetWorth = Math.max(cumulativeNetWorth, 0)
    acc.push({
      ...item,
      netWorth: cumulativeNetWorth,
      cumulativeIncome,
      cumulativeExpenses,
      cashbank: positiveNetWorth * categoryProportions.cashbank,
      invested: positiveNetWorth * categoryProportions.invested,
      lended: positiveNetWorth * categoryProportions.lended,
      other: positiveNetWorth * categoryProportions.other,
    })
    return acc
  }, [] as Array<typeof monthlyNetWorth[number] & { netWorth: number; cumulativeIncome: number; cumulativeExpenses: number; cashbank: number; invested: number; lended: number; other: number }>)

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
                  {isLoading ? '...' : formatCurrency(totalAssets)}
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
                  {isLoading ? '...' : formatCurrency(totalLiabilities)}
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
                  {isLoading ? '...' : formatCurrency(netWorth)}
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
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Net Worth Trend (All Time)</h3>
            </div>
            <button
              onClick={() => setShowStacked(!showStacked)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                showStacked
                  ? 'bg-primary text-white shadow-lg shadow-primary/50'
                  : 'bg-white/5 text-muted-foreground hover:bg-white/10 border border-white/10'
              }`}
            >
              {showStacked ? '📊 Stacked View' : '📈 Total View'}
            </button>
          </div>
          {isLoading ? (
            <div className="h-80 flex items-center justify-center">
              <div className="animate-pulse text-gray-400">Loading chart...</div>
            </div>
          ) : netWorthData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={netWorthData}>
                <defs>
                  <linearGradient id="colorNetWorth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient id="colorInvested" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient id="colorLended" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient id="colorOther" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0.2} />
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
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Legend />
                {showStacked ? (
                  <>
                    <Area
                      type="monotone"
                      dataKey="cashbank"
                      stackId="1"
                      stroke="#10b981"
                      fillOpacity={1}
                      fill="url(#colorCash)"
                      name="Cash/Bank"
                    />
                    <Area
                      type="monotone"
                      dataKey="invested"
                      stackId="1"
                      stroke="#8b5cf6"
                      fillOpacity={1}
                      fill="url(#colorInvested)"
                      name="Investments"
                    />
                    <Area
                      type="monotone"
                      dataKey="lended"
                      stackId="1"
                      stroke="#f59e0b"
                      fillOpacity={1}
                      fill="url(#colorLended)"
                      name="Lended"
                    />
                    <Area
                      type="monotone"
                      dataKey="other"
                      stackId="1"
                      stroke="#ec4899"
                      fillOpacity={1}
                      fill="url(#colorOther)"
                      name="Others"
                    />
                  </>
                ) : (
                  <Area
                    type="monotone"
                    dataKey="netWorth"
                    stroke="#8b5cf6"
                    fillOpacity={1}
                    fill="url(#colorNetWorth)"
                    name="Net Worth"
                  />
                )}
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
          <h3 className="text-lg font-semibold text-white mb-6">Assets (Positive Balances)</h3>
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Loading accounts...</div>
          ) : Object.keys(accounts).filter(name => accounts[name].balance > 0).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Account</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Balance</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">% Allocated</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Type</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Transactions</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(accounts)
                    .filter(([, accountData]: [string, { balance: number; transaction_count: number }]) => accountData.balance > 0 && Math.abs(accountData.balance) >= 0.01)
                    .sort((a: [string, { balance: number; transaction_count: number }], b: [string, { balance: number; transaction_count: number }]) => {
                      // Sort by category first, then by balance within category
                      const catA = accountClassifications[a[0]] || 'Other'
                      const catB = accountClassifications[b[0]] || 'Other'
                      if (catA !== catB) return catA.localeCompare(catB)
                      return b[1].balance - a[1].balance
                    })
                    .reduce((acc, [accountName, accountData], index, array) => {
                      const currentCategory = accountClassifications[accountName] || 'Other'
                      const prevCategory = index > 0 ? (accountClassifications[array[index - 1][0]] || 'Other') : null
                      const showCategoryHeader = currentCategory !== prevCategory
                      
                      // Calculate category totals
                      if (!acc.categoryTotals[currentCategory]) {
                        acc.categoryTotals[currentCategory] = { balance: 0, transactions: 0 }
                      }
                      acc.categoryTotals[currentCategory].balance += accountData.balance
                      acc.categoryTotals[currentCategory].transactions += accountData.transactions
                      
                      // Add category header with totals
                      if (showCategoryHeader) {
                        // Need to calculate totals for this category first
                        const categoryAccounts = array.filter(([name]) => (accountClassifications[name] || 'Other') === currentCategory)
                        const catBalance = categoryAccounts.reduce((sum, [, data]) => sum + data.balance, 0)
                        const catTransactions = categoryAccounts.reduce((sum, [, data]) => sum + data.transactions, 0)
                        
                        acc.elements.push(
                          <tr key={`header-${currentCategory}`} className="bg-white/5">
                            <td className="py-2 px-4 text-sm font-semibold text-primary">{currentCategory}</td>
                            <td className="py-2 px-4 text-right text-sm font-medium text-green-400/70">
                              {formatCurrency(catBalance)}
                            </td>
                            <td className="py-2 px-4 text-right text-sm font-medium text-gray-400/70">
                              {formatPercent(catBalance / totalAssets)}
                            </td>
                            <td className="py-2 px-4 text-right text-sm font-medium text-gray-400/70">—</td>
                            <td className="py-2 px-4 text-right text-sm font-medium text-gray-400/70">{catTransactions}</td>
                          </tr>
                        )
                      }
                      
                      // Add account row
                      acc.elements.push(
                        <motion.tr
                          key={accountName}
                          className="border-b border-white/5 hover:bg-white/5 transition-colors"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                        >
                          <td className="py-3 px-4 text-white font-medium">{accountName}</td>
                          <td className="py-3 px-4 text-right font-bold text-green-400">
                            {formatCurrency(accountData.balance)}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-400">
                            {formatPercent(accountData.balance / totalAssets)}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-400">
                            {accountClassifications[accountName] || 'Other'}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-400">{accountData.transactions}</td>
                        </motion.tr>
                      )
                      
                      return acc
                    }, { elements: [] as React.ReactNode[], categoryTotals: {} as Record<string, { balance: number; transactions: number }> }).elements}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">No asset accounts found</div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <h3 className="text-lg font-semibold text-white mb-6">Liabilities (Negative Balances)</h3>
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Loading accounts...</div>
          ) : Object.keys(accounts).filter(name => accounts[name].balance < 0).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Account</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Balance</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">% Allocated</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Type</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Transactions</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(accounts)
                    .filter(([, accountData]: [string, { balance: number; transaction_count: number }]) => accountData.balance < 0 && Math.abs(accountData.balance) >= 0.01)
                    .sort((a: [string, { balance: number; transaction_count: number }], b: [string, { balance: number; transaction_count: number }]) => {
                      // Sort by category first, then by balance within category
                      const catA = accountClassifications[a[0]] || 'Other'
                      const catB = accountClassifications[b[0]] || 'Other'
                      if (catA !== catB) return catA.localeCompare(catB)
                      return Math.abs(b[1].balance) - Math.abs(a[1].balance)
                    })
                    .reduce((acc, [accountName, accountData], index, array) => {
                      const currentCategory = accountClassifications[accountName] || 'Other'
                      const prevCategory = index > 0 ? (accountClassifications[array[index - 1][0]] || 'Other') : null
                      const showCategoryHeader = currentCategory !== prevCategory
                      
                      // Calculate category totals
                      if (!acc.categoryTotals[currentCategory]) {
                        acc.categoryTotals[currentCategory] = { balance: 0, transactions: 0 }
                      }
                      acc.categoryTotals[currentCategory].balance += Math.abs(accountData.balance)
                      acc.categoryTotals[currentCategory].transactions += accountData.transactions
                      
                      // Add category header with totals
                      if (showCategoryHeader) {
                        // Need to calculate totals for this category first
                        const categoryAccounts = array.filter(([name]) => (accountClassifications[name] || 'Other') === currentCategory)
                        const catBalance = categoryAccounts.reduce((sum, [, data]) => sum + Math.abs(data.balance), 0)
                        const catTransactions = categoryAccounts.reduce((sum, [, data]) => sum + data.transactions, 0)
                        
                        acc.elements.push(
                          <tr key={`header-${currentCategory}`} className="bg-white/5">
                            <td className="py-2 px-4 text-sm font-semibold text-primary">{currentCategory}</td>
                            <td className="py-2 px-4 text-right text-sm font-medium text-red-400/70">
                              {formatCurrency(catBalance)}
                            </td>
                            <td className="py-2 px-4 text-right text-sm font-medium text-gray-400/70">
                              {formatPercent(catBalance / totalLiabilities)}
                            </td>
                            <td className="py-2 px-4 text-right text-sm font-medium text-gray-400/70">—</td>
                            <td className="py-2 px-4 text-right text-sm font-medium text-gray-400/70">{catTransactions}</td>
                          </tr>
                        )
                      }
                      
                      // Add account row
                      acc.elements.push(
                        <motion.tr
                          key={accountName}
                          className="border-b border-white/5 hover:bg-white/5 transition-colors"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                        >
                          <td className="py-3 px-4 text-white font-medium">{accountName}</td>
                          <td className="py-3 px-4 text-right font-bold text-red-400">
                            {formatCurrency(Math.abs(accountData.balance))}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-400">
                            {formatPercent(Math.abs(accountData.balance) / totalLiabilities)}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-400">
                            {accountClassifications[accountName] || 'Other'}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-400">{accountData.transactions}</td>
                        </motion.tr>
                      )
                      
                      return acc
                    }, { elements: [] as React.ReactNode[], categoryTotals: {} as Record<string, { balance: number; transactions: number }> }).elements}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">No liability accounts found</div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
