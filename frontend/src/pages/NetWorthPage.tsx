import { motion } from 'framer-motion'
import { TrendingUp, PiggyBank, CreditCard, BarChart3, ChevronDown, ChevronRight } from 'lucide-react'
import { useAccountBalances } from '@/hooks/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { chartTooltipProps, PageHeader } from '@/components/ui'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { formatCurrency, formatPercent, formatDateTick } from '@/lib/formatters'
import { CreditCardHealth } from '@/components/analytics'
import EmptyState from '@/components/shared/EmptyState'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { getCurrentYear, getCurrentMonth, getCurrentFY, getAnalyticsDateRange, type AnalyticsViewMode } from '@/lib/dateUtils'
import { accountClassificationsService } from '@/services/api/accountClassifications'
import { usePreferencesStore } from '@/store/preferencesStore'

// Category display configuration
const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  'Cash & Wallets': { label: 'Cash & Wallets', color: '#10b981' },
  'Bank Accounts': { label: 'Bank Accounts', color: '#3b82f6' },
  'Investments': { label: 'Investments', color: '#8b5cf6' },
  'Loans/Lended': { label: 'Loans/Lended', color: '#ef4444' },
  'Credit Cards': { label: 'Credit Cards', color: '#f97316' },
  // Fallback categories
  'cashbank': { label: 'Cash & Bank', color: '#3b82f6' },
  'invested': { label: 'Investments', color: '#8b5cf6' },
  'lended': { label: 'Lended', color: '#14b8a6' },
  'liability': { label: 'Liabilities', color: '#ef4444' },
  'other': { label: 'Other', color: '#6b7280' },
}

export default function NetWorthPage() {
  const { data: balanceData, isLoading: balancesLoading } = useAccountBalances()
  const { data: transactions = [], isLoading: transactionsLoading } = useTransactions()
  const { data: preferences } = usePreferences()
  const [showStacked, setShowStacked] = useState(false)
  const [classifications, setClassifications] = useState<Record<string, string>>({})
  const [expandedAssetCategories, setExpandedAssetCategories] = useState<Set<string>>(new Set())
  const [expandedLiabilityCategories, setExpandedLiabilityCategories] = useState<Set<string>>(new Set())

  // Time filter state
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4
  const { displayPreferences } = usePreferencesStore()
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>(
    (displayPreferences.defaultTimeRange as AnalyticsViewMode) || 'all_time'
  )
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [currentFY, setCurrentFY] = useState(getCurrentFY(fiscalYearStartMonth))

  const dateRange = useMemo(() => {
    return getAnalyticsDateRange(viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth)
  }, [viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth])

  const dataDateRange = useMemo(() => {
    if (!transactions || transactions.length === 0) return { minDate: undefined, maxDate: undefined }
    const dates = transactions.map(t => t.date.substring(0, 10)).sort()
    return { minDate: dates[0], maxDate: dates[dates.length - 1] }
  }, [transactions])

  // Load account classifications
  useEffect(() => {
    const loadClassifications = async () => {
      try {
        const data = await accountClassificationsService.getAllClassifications()
        setClassifications(data)
      } catch {
        // Classifications will use defaults if loading fails
      }
    }
    loadClassifications()
  }, [])

  const isLoading = balancesLoading || transactionsLoading

  // Calculate totals from balance data - memoized to avoid changing on every render
  const accounts = useMemo(() => balanceData?.accounts || {}, [balanceData?.accounts])
  const totalAssets = Object.values(accounts)
    .filter((acc) => acc.balance > 0)
    .reduce((sum, acc) => sum + acc.balance, 0)
  const totalLiabilities = Math.abs(
    Object.values(accounts)
      .filter((acc) => acc.balance < 0)
      .reduce((sum, acc) => sum + acc.balance, 0),
  )
  const netWorth = totalAssets - totalLiabilities

  // Get investment account mappings from preferences - memoized
  const investmentMappings = useMemo(
    () => preferences?.investment_account_mappings || {},
    [preferences?.investment_account_mappings]
  )
  
  // Helper to get account type (for display in tables) - uses classifications from preferences
  const getAccountType = (accountName: string): string => {
    // First check if classified in user preferences
    if (classifications[accountName]) {
      // For Investments, just show "Investments" (don't break into subcategories)
      if (classifications[accountName] === 'Investments') {
        return 'Investments'
      }
      // Combine Cash and Other Wallets
      if (classifications[accountName] === 'Cash' || classifications[accountName] === 'Other Wallets') {
        return 'Cash & Wallets'
      }
      return classifications[accountName]
    }
    
    // Fallback: If it's mapped as an investment, show "Investments"
    if (investmentMappings[accountName]) {
      return 'Investments'
    }
    
    // Fallback to name-based heuristics for unclassified accounts
    const name = accountName.toLowerCase()
    if (name.includes('credit') || name.includes('card')) return 'Credit Cards'
    if (name.includes('bank')) return 'Bank Accounts'
    if (name.includes('cash') || name.includes('wallet')) return 'Cash & Wallets'
    
    return 'Other'
  }
  
  // Categorize accounts - uses classifications from preferences - memoized with useCallback
  const categorizeAccount = useCallback((accountName: string) => {
    // First check user's classification preferences
    const classification = classifications[accountName]
    
    if (classification) {
      switch (classification) {
        case 'Cash':
        case 'Other Wallets':
          return 'Cash & Wallets'
        case 'Bank Accounts':
          return 'Bank Accounts'
        case 'Investments':
          return 'Investments'
        case 'Credit Cards':
          return 'Credit Cards'
        case 'Loans':
        case 'Loans/Lended':
          return 'Loans/Lended'
        default:
          return classification
      }
    }
    
    // Check if it's in investment mappings (even without classification)
    if (investmentMappings[accountName]) {
      return 'Investments'
    }
    
    // Fallback to name-based heuristics for unclassified accounts
    const name = accountName.toLowerCase()
    if (name.includes('credit') || name.includes('card')) return 'Credit Cards'
    if (name.includes('bank')) return 'Bank Accounts'
    if (name.includes('cash') || name.includes('wallet')) return 'Cash & Wallets'
    if (name.includes('loan') || name.includes('emi') || name.includes('lend')) return 'Loans/Lended'
    
    return 'Other'
  }, [classifications, investmentMappings])

  // Calculate category totals from current balances using classifications
  const categoryTotals = useMemo(() => {
    return Object.entries(accounts).reduce((acc, [name, data]) => {
      const category = categorizeAccount(name)
      if (!acc[category]) acc[category] = 0
      // Use absolute value since negative balances are assets
      acc[category] += Math.abs(data.balance)
      return acc
    }, {} as Record<string, number>)
  }, [accounts, categorizeAccount])

  // Get all unique categories for the chart
  const allCategories = useMemo(() => {
    const categories = new Set(Object.keys(categoryTotals))
    return Array.from(categories).filter(cat => !['Credit Cards', 'Loans', 'Loans/Lended', 'Other'].includes(cat)) // Exclude liabilities and generic Other from asset chart
  }, [categoryTotals])

  // totalPositive is the same as totalAssets - memoize to avoid prop changes
  const totalPositive = useMemo(() => totalAssets, [totalAssets])
  
  // Calculate proportions dynamically based on actual categories
  const categoryProportions = useMemo(() => {
    const props: Record<string, number> = {}
    allCategories.forEach(cat => {
      props[cat] = totalPositive > 0 ? (categoryTotals[cat] || 0) / totalPositive : 0
    })
    return props
  }, [categoryTotals, allCategories, totalPositive])

  // Compute daily cumulative net worth from transactions
  const netWorthData = useMemo(() => {
    if (!transactions.length) return []

    const dailyMap: Record<string, { income: number; expense: number }> = {}
    for (const tx of transactions) {
      const day = tx.date.substring(0, 10)
      if (!dailyMap[day]) dailyMap[day] = { income: 0, expense: 0 }
      if (tx.type === 'Income') dailyMap[day].income += tx.amount
      else if (tx.type === 'Expense') dailyMap[day].expense += tx.amount
    }

    const sortedDays = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b))
    let cumNW = 0
    let cumIncome = 0
    let cumExpense = 0

    return sortedDays.map(([date, { income, expense }]) => {
      const flow = income - expense
      cumNW += flow
      cumIncome += income
      cumExpense += expense
      const positiveNW = Math.max(cumNW, 0)

      const point: Record<string, number | string> = {
        date,
        netWorth: cumNW,
        dailyFlow: flow,
        cumulativeIncome: cumIncome,
        cumulativeExpenses: cumExpense,
      }

      allCategories.forEach(cat => {
        point[cat] = positiveNW * (categoryProportions[cat] || 0)
      })

      return point
    })
  }, [transactions, allCategories, categoryProportions])

  // Filter chart data to selected time range
  const filteredNetWorthData = useMemo(() => {
    if (!dateRange.start_date) return netWorthData
    return netWorthData.filter((item) => {
      const d = item.date as string
      return d >= dateRange.start_date! &&
             (!dateRange.end_date || d <= dateRange.end_date)
    })
  }, [netWorthData, dateRange])

  const toggleCategory = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    category: string,
  ) => {
    setter(prev => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Net Worth"
          subtitle="Track your total assets and liabilities"
          action={
            <AnalyticsTimeFilter
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              currentYear={currentYear}
              currentMonth={currentMonth}
              currentFY={currentFY}
              onYearChange={setCurrentYear}
              onMonthChange={setCurrentMonth}
              onFYChange={setCurrentFY}
              minDate={dataDateRange.minDate}
              maxDate={dataDateRange.maxDate}
              fiscalYearStartMonth={fiscalYearStartMonth}
            />
          }
        />

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
              <h3 className="text-lg font-semibold text-white">Net Worth Trend</h3>
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
          ) : filteredNetWorthData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={filteredNetWorthData}>
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
                  {/* Dynamic gradients for each category */}
                  {allCategories.map((cat) => {
                    const config = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG['other']
                    return (
                      <linearGradient key={`color-${cat}`} id={`color-${cat.replaceAll(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={config.color} stopOpacity={0.7} />
                        <stop offset="95%" stopColor={config.color} stopOpacity={0.2} />
                      </linearGradient>
                    )
                  })}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" stroke="#9ca3af" tickFormatter={(v) => formatDateTick(v, filteredNetWorthData.length)} angle={-45} textAnchor="end" height={80} interval={Math.max(1, Math.floor(filteredNetWorthData.length / 20))} />
                <YAxis stroke="#9ca3af" />
                <Tooltip
                  {...chartTooltipProps}
                  formatter={(value: number | undefined) => value !== undefined ? formatCurrency(value) : ''}
                  labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                />
                <Legend />
                {showStacked ? (
                  <>
                    {allCategories.map((cat) => {
                      const config = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG['other']
                      return (
                        <Area
                          key={cat}
                          type="natural"
                          dataKey={cat}
                          stackId="1"
                          stroke={config.color}
                          fillOpacity={1}
                          fill={`url(#color-${cat.replaceAll(/\s+/g, '')})`}
                          name={config.label}
                          isAnimationActive={filteredNetWorthData.length < 500}
                        />
                      )
                    })}
                  </>
                ) : (
                  <Area
                    type="natural"
                    dataKey="netWorth"
                    stroke="#8b5cf6"
                    fillOpacity={1}
                    fill="url(#colorNetWorth)"
                    name="Net Worth"
                    isAnimationActive={filteredNetWorthData.length < 500}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={BarChart3}
              title="No data available"
              description="Upload your transaction data to track net worth over time."
              actionLabel="Upload Data"
              actionHref="/upload"
            />
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
                    .filter(([, accountData]) => accountData.balance > 0 && Math.abs(accountData.balance) >= 0.01)
                    .sort((a, b) => {
                      // Sort by category first, then by balance within category
                      const catA = getAccountType(a[0])
                      const catB = getAccountType(b[0])
                      if (catA !== catB) return catA.localeCompare(catB)
                      return b[1].balance - a[1].balance
                    })
                    .reduce((acc, [accountName, accountData], index, array) => {
                      const currentCategory = getAccountType(accountName)
                      const prevCategory = index > 0 ? getAccountType(array[index - 1][0]) : null
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
                        const categoryAccounts = array.filter(([name]) => (getAccountType(name)) === currentCategory)
                        const catBalance = categoryAccounts.reduce((sum, [, data]) => sum + data.balance, 0)
                        const catTransactions = categoryAccounts.reduce((sum, [, data]) => sum + data.transactions, 0)
                        
                        acc.elements.push(
                          <tr
                            key={`header-${currentCategory}`}
                            className="bg-white/5 cursor-pointer hover:bg-white/8 transition-colors"
                            onClick={() => toggleCategory(setExpandedAssetCategories, currentCategory)}
                          >
                            <td className="py-2 px-4 text-sm font-semibold text-primary">
                              <span className="flex items-center gap-2">
                                {expandedAssetCategories.has(currentCategory)
                                  ? <ChevronDown className="w-4 h-4" />
                                  : <ChevronRight className="w-4 h-4" />}
                                {currentCategory}
                                <span className="text-xs text-gray-500 font-normal">({categoryAccounts.length})</span>
                              </span>
                            </td>
                            <td className="py-2 px-4 text-right text-sm font-medium text-green-400/70">
                              {formatCurrency(catBalance)}
                            </td>
                            <td className="py-2 px-4 text-right text-sm font-medium text-gray-400/70">
                              {formatPercent((catBalance / totalAssets) * 100)}
                            </td>
                            <td className="py-2 px-4 text-right text-sm font-medium text-gray-400/70">—</td>
                            <td className="py-2 px-4 text-right text-sm font-medium text-gray-400/70">{catTransactions}</td>
                          </tr>
                        )
                      }

                      // Add account row (only if category is expanded)
                      if (expandedAssetCategories.has(currentCategory)) {
                        acc.elements.push(
                          <motion.tr
                            key={accountName}
                            className="border-b border-white/5 hover:bg-white/5 transition-colors"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                          >
                            <td className="py-3 pl-10 pr-4 text-white font-medium">{accountName}</td>
                            <td className="py-3 px-4 text-right font-bold text-green-400">
                              {formatCurrency(accountData.balance)}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-400">
                              {formatPercent((accountData.balance / totalAssets) * 100)}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-400">
                              {getAccountType(accountName)}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-400">{accountData.transactions}</td>
                          </motion.tr>
                        )
                      }
                      
                      return acc
                    }, { elements: [] as React.ReactNode[], categoryTotals: {} as Record<string, { balance: number; transactions: number }> }).elements}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={PiggyBank}
              title="No asset accounts found"
              description="Add transactions for accounts with positive balances to see your assets."
              variant="compact"
            />
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
                    .filter(([, accountData]) => accountData.balance < 0 && Math.abs(accountData.balance) >= 0.01)
                    .sort((a, b) => {
                      // Sort by category first, then by balance within category
                      const catA = getAccountType(a[0])
                      const catB = getAccountType(b[0])
                      if (catA !== catB) return catA.localeCompare(catB)
                      return Math.abs(b[1].balance) - Math.abs(a[1].balance)
                    })
                    .reduce((acc, [accountName, accountData], index, array) => {
                      const currentCategory = getAccountType(accountName)
                      const prevCategory = index > 0 ? getAccountType(array[index - 1][0]) : null
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
                        const categoryAccounts = array.filter(([name]) => (getAccountType(name)) === currentCategory)
                        const catBalance = categoryAccounts.reduce((sum, [, data]) => sum + Math.abs(data.balance), 0)
                        const catTransactions = categoryAccounts.reduce((sum, [, data]) => sum + data.transactions, 0)
                        
                        acc.elements.push(
                          <tr
                            key={`header-${currentCategory}`}
                            className="bg-white/5 cursor-pointer hover:bg-white/8 transition-colors"
                            onClick={() => toggleCategory(setExpandedLiabilityCategories, currentCategory)}
                          >
                            <td className="py-2 px-4 text-sm font-semibold text-primary">
                              <span className="flex items-center gap-2">
                                {expandedLiabilityCategories.has(currentCategory)
                                  ? <ChevronDown className="w-4 h-4" />
                                  : <ChevronRight className="w-4 h-4" />}
                                {currentCategory}
                                <span className="text-xs text-gray-500 font-normal">({categoryAccounts.length})</span>
                              </span>
                            </td>
                            <td className="py-2 px-4 text-right text-sm font-medium text-red-400/70">
                              {formatCurrency(catBalance)}
                            </td>
                            <td className="py-2 px-4 text-right text-sm font-medium text-gray-400/70">
                              {formatPercent((catBalance / totalLiabilities) * 100)}
                            </td>
                            <td className="py-2 px-4 text-right text-sm font-medium text-gray-400/70">—</td>
                            <td className="py-2 px-4 text-right text-sm font-medium text-gray-400/70">{catTransactions}</td>
                          </tr>
                        )
                      }

                      // Add account row (only if category is expanded)
                      if (expandedLiabilityCategories.has(currentCategory)) {
                        acc.elements.push(
                          <motion.tr
                            key={accountName}
                            className="border-b border-white/5 hover:bg-white/5 transition-colors"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                          >
                            <td className="py-3 pl-10 pr-4 text-white font-medium">{accountName}</td>
                            <td className="py-3 px-4 text-right font-bold text-red-400">
                              {formatCurrency(Math.abs(accountData.balance))}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-400">
                              {formatPercent((Math.abs(accountData.balance) / totalLiabilities) * 100)}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-400">
                              {getAccountType(accountName)}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-400">{accountData.transactions}</td>
                          </motion.tr>
                        )
                      }
                      
                      return acc
                    }, { elements: [] as React.ReactNode[], categoryTotals: {} as Record<string, { balance: number; transactions: number }> }).elements}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={CreditCard}
              title="No liability accounts found"
              description="Great news! You don't have any liability accounts with negative balances."
              variant="compact"
            />
          )}
        </motion.div>

        {/* Credit Card Health */}
        <CreditCardHealth />
      </div>
    </div>
  )
}
