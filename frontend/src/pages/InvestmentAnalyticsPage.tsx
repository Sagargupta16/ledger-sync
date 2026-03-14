import { motion } from 'framer-motion'
import { rawColors } from '@/constants/colors'
import { TrendingUp, PieChart, DollarSign, LineChart, Target } from 'lucide-react'
import MetricCard from '@/components/shared/MetricCard'
import { useMemo, useState } from 'react'
import { useAccountBalances } from '@/hooks/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { PieChart as RechartsPie, Pie, Cell, Tooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts'
import { chartTooltipProps, PageHeader, ChartContainer, GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, shouldAnimate, LEGEND_DEFAULTS } from '@/components/ui'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'

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
  
  // Compute actual Net Investment P&L — same logic as ReturnsAnalysisPage
  const netInvestmentPL = useMemo(() => {
    const txText = (tx: { category: string; note?: string; subcategory?: string }) =>
      `${tx.category} ${tx.note ?? ''} ${tx.subcategory ?? ''}`.toLowerCase()

    const filterSum = (type: string, test: (l: string) => boolean, investOnly = false) =>
      transactions
        .filter(tx => {
          if (tx.type !== type) return false
          const lower = txText(tx)
          if (investOnly) {
            const cat = tx.category.toLowerCase()
            if (!cat.includes('investment') && !cat.includes('stock') && !cat.includes('trading')) return false
          }
          return test(lower)
        })
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)

    const dividendIncome = filterSum('Income', l => l.includes('dividend') || l.includes('divid'))
    const interestIncome = filterSum('Income', l => l.includes('interest') || l.includes('int.') || l.includes('int cr'))
    const investmentProfit = filterSum('Income', l => l.includes('profit') || l.includes('gain') || l.includes('realized'))
    const brokerFees = filterSum('Expense', l =>
      (l.includes('broker') && (l.includes('charge') || l.includes('fee'))) ||
      l.includes('brokerage') ||
      (l.includes('demat') && l.includes('charge')) ||
      (l.includes('trading') && (l.includes('charge') || l.includes('fee'))) ||
      (l.includes('transaction') && l.includes('charge')),
      true)
    const investmentLoss = filterSum('Expense', l =>
      !l.includes('broker') && !l.includes('brokerage') && (l.includes('loss') || l.includes('write')),
      true)

    return (investmentProfit + dividendIncome + interestIncome) - (investmentLoss + brokerFees)
  }, [transactions])

  const plPercent = totalInvestmentValue > 0 ? (netInvestmentPL / totalInvestmentValue) * 100 : 0

  // Monthly investment target from preferences
  const monthlyInvestmentTarget = preferences?.monthly_investment_target ?? 0

  // Current month's total investment (transfers IN to investment accounts)
  const currentMonthInvestment = useMemo(() => {
    if (!transactions.length || !investmentAccounts.length) return 0
    const now = new Date()
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    let total = 0
    for (const tx of transactions) {
      if (!tx.date.startsWith(currentMonthKey)) continue
      if (tx.type === 'Transfer' && investmentAccounts.includes(tx.to_account || '')) {
        total += tx.amount
      }
    }
    return total
  }, [transactions, investmentAccounts])

  const targetProgress = monthlyInvestmentTarget > 0
    ? Math.min((currentMonthInvestment / monthlyInvestmentTarget) * 100, 100)
    : 0

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
  const { dateRange, timeFilterProps } = useAnalyticsTimeFilter(
    transactions,
    { defaultViewMode: 'all_time' },
  )

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
            <AnalyticsTimeFilter {...timeFilterProps} />
          }
        />

        <div className={`grid grid-cols-1 sm:grid-cols-2 ${monthlyInvestmentTarget > 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4 sm:gap-6`}>
          <MetricCard title="Total Investment Value" value={formatCurrency(totalInvestmentValue)} icon={TrendingUp} color="green" isLoading={isLoading} />
          <MetricCard title="Portfolio Assets" value={investmentAccounts.length} icon={PieChart} color="blue" isLoading={isLoading} />
          <MetricCard title="Net Investment P&L" value={`${netInvestmentPL >= 0 ? '+' : ''}${formatCurrency(netInvestmentPL)}`} subtitle={`${plPercent >= 0 ? '+' : ''}${formatPercent(plPercent)} of portfolio`} icon={DollarSign} color={netInvestmentPL >= 0 ? 'green' : 'red'} isLoading={isLoading} />
          {monthlyInvestmentTarget > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="relative p-6 glass rounded-2xl overflow-hidden group border border-white/5 border-t-white/10 border-l-white/10 shadow-xl shadow-black/40"
            >
              <div className="inline-flex p-3 rounded-2xl mb-4 bg-ios-orange/15" style={{ boxShadow: '0 8px 24px rgba(255,159,10,0.15)' }}>
                <Target className="w-6 h-6 text-ios-orange" />
              </div>
              <h3 className="text-sm font-medium mb-1 text-text-secondary">Monthly Target</h3>
              <p className="text-xl sm:text-2xl md:text-3xl font-semibold text-white">
                {formatCurrency(monthlyInvestmentTarget)}
              </p>
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-tertiary">
                    {formatCurrency(currentMonthInvestment)} invested
                  </span>
                  <span className={targetProgress >= 100 ? 'text-ios-green font-medium' : 'text-ios-orange font-medium'}>
                    {targetProgress.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: targetProgress >= 100 ? rawColors.ios.green : rawColors.ios.orange }}
                    initial={{ width: 0 }}
                    animate={{ width: `${targetProgress}%` }}
                    transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
                  />
                </div>
              </div>
            </motion.div>
          )}
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
              <ChartContainer height={320}>
                <RechartsPie>
                  <Pie
                    data={assetAllocation}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, payload }) => `${name} (${payload.percentage}%)`}
                    outerRadius={100}
                    strokeWidth={0}
                    paddingAngle={2}
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
                  <Legend {...LEGEND_DEFAULTS} />
                </RechartsPie>
              </ChartContainer>
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
              <ChartContainer height={400}>
                <AreaChart data={filteredGrowthData}>
                  <defs>
                    {INVESTMENT_CATEGORIES.map((category) => (
                      <linearGradient key={`gradient-${category}`} id={`color-${category.replaceAll(/[\s/]/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CATEGORY_COLORS[category]} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={CATEGORY_COLORS[category]} stopOpacity={0.2}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid {...GRID_DEFAULTS} />
                  <XAxis {...xAxisDefaults(filteredGrowthData.length, { angle: -45, height: 80, dateFormatter: true })} dataKey="date" />
                  <YAxis {...yAxisDefaults()} />
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(value: number | undefined, name: string | undefined) => [
                      value === undefined ? '' : formatCurrency(value),
                      name || ''
                    ]}
                    labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  />
                  <Legend {...LEGEND_DEFAULTS} />
                  {INVESTMENT_CATEGORIES.map((category) => (
                    <Area
                      key={category}
                      type="monotone"
                      dataKey={category}
                      stackId="1"
                      stroke={CATEGORY_COLORS[category]}
                      strokeWidth={2}
                      dot={false}
                      fillOpacity={1}
                      fill={`url(#color-${category.replaceAll(/[\s/]/g, '-')})`}
                      isAnimationActive={shouldAnimate(filteredGrowthData.length)}
                      animationDuration={600}
                      animationEasing="ease-out"
                    />
                  ))}
                </AreaChart>
              </ChartContainer>
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
                    <th
                      onClick={() => toggleInvestSort('value')}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleInvestSort('value') } }}
                      tabIndex={0}
                      aria-sort={investSortKey === 'value' ? (investSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground cursor-pointer hover:text-white select-none"
                    >
                      Value {investSortKey === 'value' && (investSortDir === 'asc' ? '\u2191' : '\u2193')}
                    </th>
                    <th
                      onClick={() => toggleInvestSort('percentage')}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleInvestSort('percentage') } }}
                      tabIndex={0}
                      aria-sort={investSortKey === 'percentage' ? (investSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground cursor-pointer hover:text-white select-none"
                    >
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
