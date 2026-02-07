import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Banknote, Receipt } from 'lucide-react'
import { useAccountBalances, useMonthlyAggregation } from '@/hooks/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { chartTooltipProps, PageHeader } from '@/components/ui'
import { useMemo, useState } from 'react'
import { formatCurrency, formatCurrencyShort, formatPercent } from '@/lib/formatters'
import EmptyState from '@/components/shared/EmptyState'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { getCurrentYear, getCurrentMonth, getCurrentFY, getAnalyticsDateRange, getDateKey, type AnalyticsViewMode } from '@/lib/dateUtils'

const INVESTMENT_KEYWORDS = ['invest', 'mutual', 'stock', 'equity', 'sip', 'portfolio', 'fund', 'demat']

const isInvestmentAccount = (accountName: string): boolean => {
  const lower = accountName.toLowerCase()
  return INVESTMENT_KEYWORDS.some(keyword => lower.includes(keyword))
}

// Calculate CAGR: (Ending Value / Beginning Value)^(1/years) - 1
const calculateCAGR = (endingValue: number, beginningValue: number, years: number): number => {
  if (beginningValue <= 0 || years <= 0) return 0
  return (Math.pow(endingValue / beginningValue, 1 / years) - 1) * 100
}

export default function ReturnsAnalysisPage() {
  const { data: preferences } = usePreferences()
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4

  // Time filter state
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>('fy')
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [currentFY, setCurrentFY] = useState(getCurrentFY(fiscalYearStartMonth))
  
  const { data: balanceData, isLoading: balancesLoading } = useAccountBalances()
  const { data: aggregationData, isLoading: aggregationLoading } = useMonthlyAggregation()
  const { data: allTransactions = [] } = useTransactions()

  const isLoading = balancesLoading || aggregationLoading

  // Get date range based on current filter
  const dateRange = useMemo(() => {
    return getAnalyticsDateRange(viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth)
  }, [viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth])

  // Filter transactions based on selected time range
  const transactions = useMemo(() => {
    if (!dateRange.start_date) return allTransactions
    
    return allTransactions.filter(tx => {
      // Compare only the date part (YYYY-MM-DD) to handle datetime strings correctly
      const txDate = getDateKey(tx.date)
      return txDate >= dateRange.start_date! && (!dateRange.end_date || txDate <= dateRange.end_date)
    })
  }, [allTransactions, dateRange])

  // Filter investment accounts first
  const investmentAccounts = useMemo(() => {
    const accounts = balanceData?.accounts || {}
    return Object.entries(accounts)
      .filter(([name]) => isInvestmentAccount(name))
      .map(([name, data]) => ({
        name,
        balance: Math.abs((data as { balance: number; transactions: number }).balance),
        transactions: (data as { balance: number; transactions: number }).transactions,
      }))
      .sort((a, b) => b.balance - a.balance)
  }, [balanceData])

  // Total Returns = Current portfolio value
  // const totalReturns = useMemo(() => {
  //   return investmentAccounts.reduce((sum, acc) => sum + acc.balance, 0)
  // }, [investmentAccounts])

  // Calculate Dividend Income from transactions
  const dividendIncome = useMemo(() => {
    const dividendTxs = transactions
      .filter((tx) => {
        const lower = `${tx.category} ${tx.note || ''} ${tx.subcategory || ''}`.toLowerCase()
        return tx.type === 'Income' && (
          lower.includes('dividend') || 
          lower.includes('divid')
        )
      })
    
    return dividendTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
  }, [transactions])

  // Calculate Broker Fees from transactions (investment-related only)
  const brokerFees = useMemo(() => {
    return transactions
      .filter((tx) => {
        const lower = `${tx.category} ${tx.note || ''} ${tx.subcategory || ''}`.toLowerCase()
        const categoryLower = tx.category.toLowerCase()
        
        if (tx.type !== 'Expense') return false
        if (!categoryLower.includes('investment') && !categoryLower.includes('stock') && !categoryLower.includes('trading')) return false
        
        // Check for broker/brokerage keywords FIRST (more specific)
        return (lower.includes('broker') && (lower.includes('charge') || lower.includes('fee'))) ||
               lower.includes('brokerage') || 
               (lower.includes('demat') && lower.includes('charge')) ||
               (lower.includes('trading') && (lower.includes('charge') || lower.includes('fee'))) ||
               (lower.includes('transaction') && lower.includes('charge'))
      })
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
  }, [transactions])

  // Calculate Interest Income from all accounts
  const interestIncome = useMemo(() => {
    return transactions
      .filter((tx) => {
        const lower = `${tx.category} ${tx.note || ''} ${tx.subcategory || ''}`.toLowerCase()
        return tx.type === 'Income' && (
          lower.includes('interest') ||
          lower.includes('int.') ||
          lower.includes('int cr') ||
          lower.includes('int credit')
        )
      })
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
  }, [transactions])

  // Calculate actual Profit from investment sales/gains
  const investmentProfit = useMemo(() => {
    return transactions
      .filter((tx) => {
        const lower = `${tx.category} ${tx.note || ''} ${tx.subcategory || ''}`.toLowerCase()
        return tx.type === 'Income' && (
          lower.includes('profit') || 
          lower.includes('gain') ||
          lower.includes('realized')
        )
      })
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
  }, [transactions])

  // Calculate actual Loss from investments (exclude broker fees)
  const investmentLoss = useMemo(() => {
    return transactions
      .filter((tx) => {
        const lower = `${tx.category} ${tx.note || ''} ${tx.subcategory || ''}`.toLowerCase()
        const categoryLower = tx.category.toLowerCase()
        
        if (tx.type !== 'Expense') return false
        if (!categoryLower.includes('investment') && !categoryLower.includes('stock') && !categoryLower.includes('trading')) return false
        
        // Skip if it's a broker fee (check broker/brokerage keywords first)
        if (lower.includes('broker') || lower.includes('brokerage')) return false
        
        // Now check for loss keywords
        return lower.includes('loss') || lower.includes('write')
      })
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
  }, [transactions])

  // Net Profit/Loss = Total Income - Total Expenses (including all fees and income sources)
  const netProfitLoss = useMemo(() => {
    const totalIncome = investmentProfit + dividendIncome + interestIncome
    const totalExpenses = investmentLoss + brokerFees
    return totalIncome - totalExpenses
  }, [investmentProfit, dividendIncome, interestIncome, investmentLoss, brokerFees])

  // Calculate average CAGR from monthly data
  const monthlyDataArray = useMemo(() => {
    const data = Object.entries(aggregationData || {})
      .map(([month, value]) => ({ month, ...(value as { income?: number; expense?: number; net_savings?: number; transactions?: number }) }))
      .sort((a, b) => a.month.localeCompare(b.month))
    return data
  }, [aggregationData])

  // Estimate CAGR based on growth from first to last month
  const estimatedCAGR = useMemo(() => {
    if (monthlyDataArray.length < 2) return 0
    const firstMonth = monthlyDataArray[0]
    const lastMonth = monthlyDataArray[monthlyDataArray.length - 1]
    const beginningValue = firstMonth.income || 1
    const endingValue = lastMonth.income || beginningValue
    const months = monthlyDataArray.length
    const years = months / 12
    return calculateCAGR(endingValue, beginningValue, Math.max(years, 0.1))
  }, [monthlyDataArray])

  // Find best performing account by balance
  // const bestPerformingAccount = useMemo(
  //   () => investmentAccounts[0]?.name || 'N/A',
  //   [investmentAccounts],
  // )

  // Prepare data for bar chart - show top 5 accounts
  // // const chartData = investmentAccounts.slice(0, 5).map((acc) => ({
  //   name: acc.name.replace(/.*\b/, '').substring(0, 15),
  //   value: acc.balance,
  // }))

  // Calculate cumulative P&L over time from transactions
  const cumulativeReturnsData = useMemo(() => {
    // Group transactions by month
    const monthlyData: Record<string, { income: number; expenses: number }> = {}
    
    transactions.forEach((tx) => {
      const date = new Date(tx.date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { income: 0, expenses: 0 }
      }
      
      const lower = `${tx.category} ${tx.note || ''} ${tx.subcategory || ''}`.toLowerCase()
      const categoryLower = tx.category.toLowerCase()
      const amount = Math.abs(tx.amount)
      
      // Income: dividends, interest, investment profit (EXACT same as individual calculations)
      if (tx.type === 'Income') {
        // Dividends
        if (lower.includes('dividend') || lower.includes('divid')) {
          monthlyData[monthKey].income += amount
        }
        // Interest
        else if (lower.includes('interest') || lower.includes('int.') || lower.includes('int cr') || lower.includes('int credit')) {
          monthlyData[monthKey].income += amount
        }
        // Investment Profit
        else if (lower.includes('profit') || lower.includes('gain') || lower.includes('realized')) {
          monthlyData[monthKey].income += amount
        }
      }
      
      // Expenses: broker fees and investment loss - ONLY from investment categories
      if (tx.type === 'Expense' && (categoryLower.includes('investment') || categoryLower.includes('stock') || categoryLower.includes('trading'))) {
        // Broker Fees (check first - more specific)
        if ((lower.includes('broker') && (lower.includes('charge') || lower.includes('fee'))) ||
            lower.includes('brokerage') ||
            (lower.includes('demat') && lower.includes('charge')) ||
            (lower.includes('trading') && (lower.includes('charge') || lower.includes('fee'))) ||
            (lower.includes('transaction') && lower.includes('charge'))) {
          monthlyData[monthKey].expenses += amount
        }
        // Investment Loss (exclude broker/brokerage to prevent double counting)
        else if (!lower.includes('broker') && !lower.includes('brokerage') && (lower.includes('loss') || lower.includes('write'))) {
          monthlyData[monthKey].expenses += amount
        }
      }
    })
    
    // Sort by month and calculate cumulative
    const sortedMonths = Object.keys(monthlyData).sort((a, b) => a.localeCompare(b))
    
    return sortedMonths.reduce<Array<{ month: string; cumulative: number; monthlyNet: number }>>((acc, month) => {
      const net = monthlyData[month].income - monthlyData[month].expenses
      const prevCumulative = acc.length > 0 ? acc[acc.length - 1].cumulative : 0
      acc.push({
        month: month,
        cumulative: Math.round(prevCumulative + net),
        monthlyNet: Math.round(net)
      })
      return acc
    }, [])
  }, [transactions])

  // Simple return on investment calculation
  const roi = monthlyDataArray.length > 0 ? estimatedCAGR / 12 : 0

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader title="Returns Analysis" subtitle="Analyze your investment returns over time" />

        {/* Analytics Time Filter */}
        <AnalyticsTimeFilter
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          currentYear={currentYear}
          currentMonth={currentMonth}
          currentFY={currentFY}
          onYearChange={setCurrentYear}
          onMonthChange={setCurrentMonth}
          onFYChange={setCurrentFY}
        />

        {/* P&L Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl shadow-lg ${netProfitLoss >= 0 ? 'bg-green-500/20 shadow-green-500/30' : 'bg-red-500/20 shadow-red-500/30'}`}>
                {netProfitLoss >= 0 ? (
                  <TrendingUp className="w-6 h-6 text-green-500" />
                ) : (
                  <TrendingDown className="w-6 h-6 text-red-500" />
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Net Profit/Loss</p>
                <p className={`text-2xl font-bold ${netProfitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {netProfitLoss >= 0 ? '' : '-'}{formatCurrency(Math.abs(netProfitLoss))}
                </p>
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
              <div className="p-3 bg-emerald-500/20 rounded-xl shadow-lg shadow-emerald-500/30">
                <Banknote className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Dividend Income</p>
                <p className="text-2xl font-bold text-emerald-400">
                  {formatCurrency(dividendIncome)}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-500/20 rounded-xl shadow-lg shadow-orange-500/30">
                <Receipt className="w-6 h-6 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Broker Fees</p>
                <p className="text-2xl font-bold text-orange-400">
                  {formatCurrency(brokerFees)}
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Cumulative Returns Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <h3 className="text-lg font-semibold text-white mb-6">Cumulative Returns Over Time</h3>
          {cumulativeReturnsData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={cumulativeReturnsData}>
                <defs>
                  <linearGradient id="positiveGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="negativeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis 
                  dataKey="month" 
                  stroke="#9ca3af"
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  stroke="#9ca3af"
                  tickFormatter={(value) => formatCurrencyShort(value)}
                />
                <Tooltip
                  {...chartTooltipProps}
                  formatter={(value: number | undefined, name: string | undefined) => {
                    if (value === undefined) return ''
                    if (name === 'cumulative') return [formatCurrency(value), 'Cumulative Returns']
                    if (name === 'monthlyNet') return [formatCurrency(value), 'Monthly Net']
                    return value
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="cumulative" 
                  stroke={(cumulativeReturnsData[cumulativeReturnsData.length - 1]?.cumulative || 0) >= 0 ? "#10b981" : "#ef4444"}
                  strokeWidth={2}
                  fill={(cumulativeReturnsData[cumulativeReturnsData.length - 1]?.cumulative || 0) >= 0 ? "url(#positiveGradient)" : "url(#negativeGradient)"}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={TrendingUp}
              title="No transaction data available"
              description="Upload your investment transactions to track returns over time."
              actionLabel="Upload Data"
              actionHref="/upload"
            />
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <h3 className="text-lg font-semibold text-white mb-6">Returns Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-xs text-gray-400 mb-2">CAGR</p>
              <p className="text-2xl font-bold text-green-400">{isLoading ? '...' : formatPercent(estimatedCAGR)}</p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-xs text-gray-400 mb-2">Monthly ROI</p>
              <p className="text-2xl font-bold text-blue-400">{isLoading ? '...' : formatPercent(roi)}</p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-xs text-gray-400 mb-2">Net P&L</p>
              <p className={`text-2xl font-bold ${netProfitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(Math.abs(netProfitLoss))}
              </p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-xs text-gray-400 mb-2">Dividends</p>
              <p className="text-2xl font-bold text-emerald-400">{formatCurrency(dividendIncome)}</p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-xs text-gray-400 mb-2">Fees Paid</p>
              <p className="text-2xl font-bold text-orange-400">{formatCurrency(brokerFees)}</p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-xs text-gray-400 mb-2">Interest Income</p>
              <p className="text-2xl font-bold text-teal-400">{formatCurrency(interestIncome)}</p>
            </div>
          </div>
        </motion.div>

        {investmentAccounts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <h3 className="text-lg font-semibold text-white mb-6">Profit & Loss Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                <p className="text-sm text-gray-400 mb-2">Total Income</p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-400">Investment Profit</span>
                    <span className="text-sm font-semibold text-green-400">{formatCurrency(investmentProfit)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-400">Dividend Income</span>
                    <span className="text-sm font-semibold text-emerald-400">{formatCurrency(dividendIncome)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-400">Interest Income</span>
                    <span className="text-sm font-semibold text-teal-400">{formatCurrency(interestIncome)}</span>
                  </div>
                  <div className="flex justify-between border-t border-green-500/20 pt-2">
                    <span className="text-sm font-semibold text-gray-300">Total</span>
                    <span className="text-lg font-bold text-green-400">{formatCurrency(investmentProfit + dividendIncome + interestIncome)}</span>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20">
                <p className="text-sm text-gray-400 mb-2">Total Expenses</p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-400">Investment Loss</span>
                    <span className="text-sm font-semibold text-red-400">{formatCurrency(investmentLoss)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-400">Broker Fees</span>
                    <span className="text-sm font-semibold text-orange-400">{formatCurrency(brokerFees)}</span>
                  </div>
                  <div className="flex justify-between border-t border-red-500/20 pt-2">
                    <span className="text-sm font-semibold text-gray-300">Total</span>
                    <span className="text-lg font-bold text-red-400">{formatCurrency(investmentLoss + brokerFees)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-white">Net Profit/Loss</span>
                <span className={`text-2xl font-bold ${netProfitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {netProfitLoss >= 0 ? '' : '-'}{formatCurrency(Math.abs(netProfitLoss))}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
