import { motion } from 'framer-motion'
import { rawColors } from '@/constants/colors'
import { CHART_AXIS_COLOR } from '@/constants/chartColors'
import { TrendingUp, PieChart, DollarSign, LineChart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAccountBalances } from '@/hooks/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Tooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts'
import { chartTooltipProps, PageHeader } from '@/components/ui'
import { formatCurrency, formatCurrencyShort, formatPercent, formatDateTick } from '@/lib/formatters'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { type AnalyticsViewMode, getCurrentYear, getCurrentMonth, getCurrentFY, getAnalyticsDateRange } from '@/lib/dateUtils'
import { CHART_ANIMATION_THRESHOLD } from '@/constants'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { usePreferencesStore } from '@/store/preferencesStore'

// 4 Investment Categories with colors
const INVESTMENT_CATEGORIES = ['FD/Bonds', 'Mutual Funds', 'PPF/EPF', 'Stocks'] as const
type InvestmentCategory = typeof INVESTMENT_CATEGORIES[number]

const CATEGORY_COLORS: Record<InvestmentCategory, string> = {
  'FD/Bonds': rawColors.ios.pink,      // Pink
  'Mutual Funds': rawColors.ios.purple,  // Purple
  'PPF/EPF': '#f59e0b',       // Amber
  'Stocks': rawColors.ios.green,        // iOS Green
}

// Map investment types from preferences to our 4 categories
// Handles both raw values (stocks, mutual_funds) and formatted names (Stocks, Mutual Funds)
const mapToCategory = (investmentType: string): InvestmentCategory => {
  const type = investmentType.toLowerCase().replaceAll(/[_\s]/g, '')
  
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

  // Calculate daily portfolio value growth by category
  // This shows NET INVESTMENTS (IN - OUT) over time with daily granularity
  const dailyGrowthData = useMemo(() => {
    if (!transactions.length || !investmentAccounts.length) return []

    // Filter for all investment transactions (both IN and OUT)
    const investmentTransactions = transactions
      .filter(tx => {
        if (tx.type === 'Transfer' && investmentAccounts.includes(tx.to_account || '')) return true
        if (tx.type === 'Transfer' && investmentAccounts.includes(tx.from_account || '')) return true
        if (tx.type === 'Income' && investmentAccounts.includes(tx.account || '')) return true
        if (tx.type === 'Expense' && investmentAccounts.includes(tx.account || '')) return true
        return false
      })
      .sort((a, b) => a.date.localeCompare(b.date))

    if (investmentTransactions.length === 0) return []

    // Track NET investment per account
    const accountInvestments: Record<string, number> = {}
    investmentAccounts.forEach(acc => { accountInvestments[acc] = 0 })

    // Track snapshots per day
    const dailySnapshots: Array<{ date: string, investments: Record<string, number> }> = []
    let currentDay = ''

    investmentTransactions.forEach(tx => {
      const dayKey = tx.date.substring(0, 10)
      const amount = tx.amount

      // Save previous day before processing new day's first transaction
      if (dayKey !== currentDay && currentDay !== '') {
        dailySnapshots.push({ date: currentDay, investments: { ...accountInvestments } })
      }
      currentDay = dayKey

      if (tx.type === 'Transfer' && investmentAccounts.includes(tx.to_account || '')) {
        accountInvestments[tx.to_account || 'Unknown'] += amount
      }
      if (tx.type === 'Transfer' && investmentAccounts.includes(tx.from_account || '')) {
        accountInvestments[tx.from_account || 'Unknown'] -= amount
      }
      if (tx.type === 'Income' && investmentAccounts.includes(tx.account || '')) {
        accountInvestments[tx.account || 'Unknown'] += amount
      }
      if (tx.type === 'Expense' && investmentAccounts.includes(tx.account || '')) {
        accountInvestments[tx.account || 'Unknown'] -= amount
      }
    })

    // Add final day
    if (currentDay) {
      dailySnapshots.push({ date: currentDay, investments: { ...accountInvestments } })
    }

    if (dailySnapshots.length === 0) return []

    // Generate all days between first and last snapshot
    const firstDate = new Date(dailySnapshots[0].date)
    const lastDate = new Date(dailySnapshots.at(-1)!.date)
    const allDays: string[] = []
    for (const d = new Date(firstDate); d <= lastDate; d.setDate(d.getDate() + 1)) {
      allDays.push(d.toISOString().substring(0, 10))
    }

    // Build chart data grouped by category
    const snapshotMap = new Map(dailySnapshots.map(s => [s.date, s.investments]))
    const lastKnown: Record<string, number> = {}
    investmentAccounts.forEach(acc => { lastKnown[acc] = 0 })

    return allDays.map(date => {
      const dataPoint: Record<string, string | number> = { date, fullDate: date }
      const snapshot = snapshotMap.get(date)

      if (snapshot) {
        investmentAccounts.forEach(account => {
          lastKnown[account] = snapshot[account] || lastKnown[account]
        })
      }

      const categoryTotals: Record<InvestmentCategory, number> = {
        'FD/Bonds': 0, 'Mutual Funds': 0, 'PPF/EPF': 0, 'Stocks': 0,
      }

      investmentAccounts.forEach(account => {
        const category = accountToCategory[account] || 'Mutual Funds'
        categoryTotals[category] += lastKnown[account]
      })

      INVESTMENT_CATEGORIES.forEach(cat => {
        dataPoint[cat] = Math.max(0, categoryTotals[cat])
      })

      return dataPoint
    })
  }, [transactions, investmentAccounts, accountToCategory])

  // Time filter state for growth chart
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month ?? 4
  const { displayPreferences } = usePreferencesStore()
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>(
    (displayPreferences.defaultTimeRange as AnalyticsViewMode) || 'all_time'
  )
  const [currentYear, setCurrentYear] = useState(getCurrentYear)
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth)
  const [currentFY, setCurrentFY] = useState(() => getCurrentFY(fiscalYearStartMonth))

  const dateRange = useMemo(
    () => getAnalyticsDateRange(viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth),
    [viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth]
  )

  const dataDateRange = useMemo(() => {
    if (!transactions || transactions.length === 0) return { minDate: undefined, maxDate: undefined }
    const dates = transactions.map(t => t.date.substring(0, 10)).sort()
    return { minDate: dates[0], maxDate: dates[dates.length - 1] }
  }, [transactions])

  const filteredGrowthData = useMemo(() => {
    if (!dateRange.start_date || !dateRange.end_date) return dailyGrowthData
    return dailyGrowthData.filter((item) => {
      const d = item.fullDate as string
      return d >= dateRange.start_date! && d <= dateRange.end_date!
    })
  }, [dailyGrowthData, dateRange])

  // Sorting state for investment accounts table
  const [investSortKey, setInvestSortKey] = useState<string | null>(null)
  const [investSortDir, setInvestSortDir] = useState<'asc' | 'desc'>('desc')

  const toggleInvestSort = (key: string) => {
    if (investSortKey === key) {
      setInvestSortDir(investSortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setInvestSortKey(key)
      setInvestSortDir('desc')
    }
  }

  const sortedPortfolioData = useMemo(() => {
    if (!investSortKey) return portfolioData
    return [...portfolioData].sort((a, b) => {
      let av: number, bv: number
      if (investSortKey === 'value') {
        av = a.value
        bv = b.value
      } else if (investSortKey === 'percentage') {
        av = Number.parseFloat(a.percentage)
        bv = Number.parseFloat(b.percentage)
      } else {
        return 0
      }
      const cmp = av - bv
      return investSortDir === 'asc' ? cmp : -cmp
    })
  }, [portfolioData, investSortKey, investSortDir])

  if (totalInvestmentValue === 0) {
    return (
      <div className="min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <PageHeader title="Investment Analytics" subtitle="Monitor your investment portfolio performance" />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-xl border border-border p-4 md:p-6 lg:p-8 shadow-lg text-center"
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
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Investment Analytics"
          subtitle="Monitor your investment portfolio performance"
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-xl border border-border p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-ios-green/20 rounded-xl shadow-lg shadow-ios-green/30">
                <TrendingUp className="w-6 h-6 text-ios-green" />
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
            className="glass rounded-xl border border-border p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-ios-blue/20 rounded-xl shadow-lg shadow-ios-blue/30">
                <PieChart className="w-6 h-6 text-ios-blue" />
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
            className="glass rounded-xl border border-border p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-ios-purple/20 rounded-xl shadow-lg shadow-ios-purple/30">
                <DollarSign className="w-6 h-6 text-ios-purple" />
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
          className="glass rounded-xl border border-border p-6 shadow-lg"
        >
          <div className="flex items-center gap-3 mb-6">
            <PieChart className="w-5 h-5 text-ios-blue" />
            <h3 className="text-lg font-semibold text-white">Asset Allocation</h3>
          </div>
          {isLoading && (
            <div className="h-80 flex items-center justify-center">
              <div className="animate-pulse text-muted-foreground">Loading chart...</div>
            </div>
          )}
          {!isLoading && (
            assetAllocation.length === 0 ? (
              <ChartEmptyState height={320} />
            ) : (
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
                    {assetAllocation.map((entry) => (
                      <Cell key={`cell-${entry.name}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(value: number | undefined) => value === undefined ? '' : formatCurrency(value)}
                  />
                  <Legend />
                </RechartsPie>
              </ResponsiveContainer>
            )
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="glass rounded-xl border border-border p-6 shadow-lg"
        >
          <div className="flex items-center gap-3 mb-6">
            <LineChart className="w-5 h-5 text-ios-purple" />
            <h3 className="text-lg font-semibold text-white">Investment Growth Over Time</h3>
          </div>
          {isLoading && (
            <div className="h-80 flex items-center justify-center">
              <div className="animate-pulse text-muted-foreground">Loading chart...</div>
            </div>
          )}
          {!isLoading && (
            filteredGrowthData.length === 0 ? (
              <ChartEmptyState height={400} />
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={filteredGrowthData}>
                  <defs>
                    {INVESTMENT_CATEGORIES.map((category) => (
                      <linearGradient key={`gradient-${category}`} id={`color-${category.replaceAll(/[\s/]/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CATEGORY_COLORS[category]} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={CATEGORY_COLORS[category]} stopOpacity={0.2}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis
                    dataKey="date"
                    stroke={CHART_AXIS_COLOR}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    tickFormatter={(v) => formatDateTick(v, filteredGrowthData.length)}
                    interval={Math.max(1, Math.floor(filteredGrowthData.length / 20))}
                  />
                  <YAxis
                    stroke={CHART_AXIS_COLOR}
                    tickFormatter={(value) => formatCurrencyShort(value)}
                  />
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(value: number | undefined, name: string | undefined) => [
                      value === undefined ? '' : formatCurrency(value),
                      name || ''
                    ]}
                    labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  />
                  <Legend />
                  {INVESTMENT_CATEGORIES.map((category) => (
                    <Area
                      key={category}
                      type="natural"
                      dataKey={category}
                      stackId="1"
                      stroke={CATEGORY_COLORS[category]}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill={`url(#color-${category.replaceAll(/[\s/]/g, '-')})`}
                      isAnimationActive={filteredGrowthData.length < CHART_ANIMATION_THRESHOLD}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            )
          )}
        </motion.div>

        {portfolioData.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="glass rounded-xl border border-border p-6 shadow-lg"
          >
            <h3 className="text-lg font-semibold text-white mb-6">Investment Accounts</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">Account</th>
                    <th onClick={() => toggleInvestSort('value')} className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground cursor-pointer hover:text-white select-none">
                      Value {investSortKey === 'value' && (investSortDir === 'asc' ? '\u2191' : '\u2193')}
                    </th>
                    <th onClick={() => toggleInvestSort('percentage')} className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground cursor-pointer hover:text-white select-none">
                      Allocation {investSortKey === 'percentage' && (investSortDir === 'asc' ? '\u2191' : '\u2193')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPortfolioData.map((item, index) => (
                    <motion.tr
                      key={`${item.name}-${index}`}
                      className="border-b border-border hover:bg-white/10 transition-colors"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 + index * 0.05 }}
                    >
                      <td className="py-3 px-4 text-white font-medium">{item.name}</td>
                      <td className="py-3 px-4 text-right text-ios-green">{formatCurrency(item.value)}</td>
                      <td className="py-3 px-4 text-right text-ios-purple">{formatPercent(Number.parseFloat(item.percentage))}</td>
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
