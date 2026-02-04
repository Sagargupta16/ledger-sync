import { motion } from 'framer-motion'
import { TrendingUp, Calculator, Calendar, Percent } from 'lucide-react'
import { useAccountBalances } from '@/hooks/useAnalytics'
import { accountClassificationsService } from '@/services/api/accountClassifications'
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from 'recharts'
import { useState, useMemo, useEffect } from 'react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'

// Hide number input spinners
const hideSpinnersStyle = `
  input[type="number"]::-webkit-outer-spin-button,
  input[type="number"]::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  input[type="number"] {
    -moz-appearance: textfield;
  }
`

interface ChartDataPoint {
  month: string
  invested: number
  value: number
  isHistorical: boolean
}

// Calculate SIP future value with monthly compounding
const calculateSIPProjection = (
  monthlySIP: number,
  annualRate: number,
  years: number,
  sipGrowthRate: number,
  startingCorpus: number,
): { value: number; invested: number; returns: number } => {
  const monthlyRate = annualRate / 12 / 100
  let totalInvested = startingCorpus
  let portfolioValue = startingCorpus
  let currentMonthlySIP = monthlySIP

  for (let month = 1; month <= years * 12; month++) {
    totalInvested += currentMonthlySIP
    portfolioValue = (portfolioValue + currentMonthlySIP) * (1 + monthlyRate)

    // Increase SIP amount annually if growth rate is set
    if (month % 12 === 0 && sipGrowthRate > 0) {
      currentMonthlySIP = currentMonthlySIP * (1 + sipGrowthRate / 100)
    }
  }

  return {
    value: portfolioValue,
    invested: totalInvested,
    returns: portfolioValue - totalInvested,
  }
}

export default function MutualFundProjectionPage() {
  const { data: balanceData, isLoading } = useAccountBalances()
  const { data: transactions = [] } = useTransactions()
  
  // State
  const [monthlySIP, setMonthlySIP] = useState(10000)
  const [expectedReturn, setExpectedReturn] = useState(12)
  const [projectionYears, setProjectionYears] = useState(10)
  const [sipGrowthRate, setSipGrowthRate] = useState(0)
  const [userModifiedSIP, setUserModifiedSIP] = useState(false)
  const [mutualFundAccounts, setMutualFundAccounts] = useState<{ name: string; balance: number }[]>([])

  // Load mutual fund accounts
  useEffect(() => {
    const loadMutualFundAccounts = async () => {
      try {
        const { accounts: investmentAccounts } = await accountClassificationsService.getAccountsByType('Investments')
        const mfAccounts = Object.entries(balanceData?.accounts || {})
          .filter(([name]) => investmentAccounts.includes(name))
          .filter(([name]) => name.toLowerCase().includes('mutual') || name.toLowerCase().includes('fund'))
          .map(([name, data]) => ({
            name,
            balance: Math.abs((data as { balance: number }).balance),
          }))
          .sort((a, b) => b.balance - a.balance)

        setMutualFundAccounts(mfAccounts)
      } catch (error) {
        setMutualFundAccounts([])
      }
    }

    loadMutualFundAccounts()
  }, [balanceData])

  // Find primary mutual fund account (Grow Mutual Funds or first available)
  const primaryAccount = useMemo(() => {
    if (mutualFundAccounts.length === 0) return null
    
    const growAccount = mutualFundAccounts.find(acc => 
      acc.name.toLowerCase().includes('grow') && acc.name.toLowerCase().includes('mutual')
    )
    
    return growAccount || mutualFundAccounts[0]
  }, [mutualFundAccounts])

  // Get current portfolio balance
  const currentBalance = primaryAccount?.balance || 0

  // Get all SIP transfer transactions to this account
  const sipTransfers = useMemo(() => {
    if (!primaryAccount) return []
    
    return transactions
      .filter(tx => 
        tx.type === 'Transfer' && 
        tx.to_account?.toLowerCase() === primaryAccount.name.toLowerCase()
      )
      .map(tx => ({
        ...tx,
        amount: Math.abs(tx.amount)
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [transactions, primaryAccount])

  // Detect last monthly SIP amount (exclude lumpsums)
  const detectedMonthlySIP = useMemo(() => {
    if (sipTransfers.length === 0) return 0
    
    // Filter for monthly SIPs only
    const monthlySIPs = sipTransfers.filter(tx => {
      const note = (tx.note || '').toLowerCase()
      return note.includes('monthly') || (!note.includes('lumpsum') && note.includes('sip'))
    })
    
    if (monthlySIPs.length === 0) return 0
    
    // Get the most recent monthly SIP
    return monthlySIPs[monthlySIPs.length - 1].amount
  }, [sipTransfers])

  // Use detected SIP if user hasn't modified it
  const activeMonthlySIP = userModifiedSIP ? monthlySIP : (detectedMonthlySIP || monthlySIP)

  // Calculate future projection
  const projection = useMemo(() => {
    return calculateSIPProjection(
      activeMonthlySIP,
      expectedReturn,
      projectionYears,
      sipGrowthRate,
      currentBalance
    )
  }, [activeMonthlySIP, expectedReturn, projectionYears, sipGrowthRate, currentBalance])

  // Build chart data: historical + projection
  const chartData = useMemo<ChartDataPoint[]>(() => {
    const data: ChartDataPoint[] = []
    
    if (sipTransfers.length === 0) return data
    
    // STEP 1: Build historical data (actual SIP transfers)
    let cumulativeInvested = 0
    const monthlyInvested = new Map<string, number>()
    
    sipTransfers.forEach(tx => {
      const date = new Date(tx.date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      cumulativeInvested += tx.amount
      monthlyInvested.set(monthKey, cumulativeInvested)
    })
    
    // Total amount actually invested
    const totalInvested = cumulativeInvested
    // Current actual value (includes gains/losses)
    const currentValue = currentBalance
    // Total gains/losses
    const totalGains = currentValue - totalInvested
    
    // Add historical months
    Array.from(monthlyInvested.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([monthKey, invested]) => {
        const [year, month] = monthKey.split('-')
        const date = new Date(parseInt(year), parseInt(month) - 1)
        const monthLabel = date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
        
        // Distribute gains proportionally based on invested amount
        const proportionalValue = totalInvested > 0 
          ? invested + (invested / totalInvested) * totalGains
          : invested
        
        data.push({
          month: monthLabel,
          invested: Math.round(invested),
          value: Math.round(proportionalValue),
          isHistorical: true,
        })
      })
    
    // STEP 2: Build projection data (future months)
    if (data.length > 0) {
      const lastHistorical = data[data.length - 1]
      const lastDate = new Date(sipTransfers[sipTransfers.length - 1].date)
      
      let projectedInvested = lastHistorical.invested
      let projectedValue = lastHistorical.value
      let currentMonthlySIP = activeMonthlySIP
      const monthlyRate = expectedReturn / 12 / 100
      
      // Project forward month by month
      for (let i = 1; i <= projectionYears * 12; i++) {
        // Calculate next month's date
        const futureDate = new Date(lastDate)
        futureDate.setMonth(lastDate.getMonth() + i)
        const monthLabel = futureDate.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
        
        // Add SIP contribution
        projectedInvested += currentMonthlySIP
        
        // Apply monthly compounding: (previous value + SIP) * (1 + monthly rate)
        projectedValue = (projectedValue + currentMonthlySIP) * (1 + monthlyRate)
        
        // Increase SIP amount annually if growth is set
        if (i % 12 === 0 && sipGrowthRate > 0) {
          currentMonthlySIP *= (1 + sipGrowthRate / 100)
        }
        
        data.push({
          month: monthLabel,
          invested: Math.round(projectedInvested),
          value: Math.round(projectedValue),
          isHistorical: false,
        })
      }
    }
    
    return data
  }, [sipTransfers, currentBalance, activeMonthlySIP, expectedReturn, projectionYears, sipGrowthRate])

  // Calculate total invested from history
  const totalHistoricalInvested = sipTransfers.reduce((sum, tx) => sum + tx.amount, 0)
  const totalGains = currentBalance - totalHistoricalInvested
  const gainsPercent = totalHistoricalInvested > 0 ? (totalGains / totalHistoricalInvested) * 100 : 0

  return (
    <>
      <style>{hideSpinnersStyle}</style>
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent drop-shadow-lg">
              SIP Projection Calculator
            </h1>
            <p className="text-muted-foreground mt-2">Analyze your mutual fund investment journey</p>
          </motion.div>

          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-xl border border-white/10 p-6 shadow-lg"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-500/20 rounded-xl shadow-lg shadow-purple-500/30">
                  <TrendingUp className="w-6 h-6 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Current Balance</p>
                  <p className="text-2xl font-bold">
                    {isLoading ? '...' : formatCurrency(currentBalance)}
                  </p>
                  {primaryAccount && (
                    <p className="text-xs text-muted-foreground mt-1">{primaryAccount.name}</p>
                  )}
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass rounded-xl border border-white/10 p-6 shadow-lg"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-500/20 rounded-xl shadow-lg shadow-green-500/30">
                  <Calculator className="w-6 h-6 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Monthly SIP</p>
                  <p className="text-2xl font-bold">
                    {isLoading ? '...' : formatCurrency(detectedMonthlySIP)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{sipTransfers.length} transactions</p>
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
                  <Percent className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Invested</p>
                  <p className="text-2xl font-bold">
                    {isLoading ? '...' : formatCurrency(totalHistoricalInvested)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Actual contributions</p>
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
                <div className={`p-3 rounded-xl shadow-lg ${totalGains >= 0 ? 'bg-emerald-500/20 shadow-emerald-500/30' : 'bg-red-500/20 shadow-red-500/30'}`}>
                  <TrendingUp className={`w-6 h-6 ${totalGains >= 0 ? 'text-emerald-500' : 'text-red-500'}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Current Gains</p>
                  <p className={`text-2xl font-bold ${totalGains >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {isLoading ? '...' : formatCurrency(totalGains)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {gainsPercent >= 0 ? '+' : ''}{gainsPercent.toFixed(2)}% returns
                  </p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Input Parameters */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <h3 className="text-lg font-semibold mb-6">Projection Parameters</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <label htmlFor="monthly-sip" className="block text-sm font-medium text-muted-foreground mb-2">
                  Monthly SIP (₹)
                </label>
                <input
                  id="monthly-sip"
                  type="number"
                  value={userModifiedSIP ? monthlySIP : (detectedMonthlySIP || monthlySIP)}
                  onChange={(e) => {
                    setMonthlySIP(Number(e.target.value))
                    setUserModifiedSIP(true)
                  }}
                  className="w-full bg-background border border-input rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  min="0"
                  step="1000"
                />
                {detectedMonthlySIP > 0 && !userModifiedSIP && (
                  <p className="text-xs text-muted-foreground mt-1">Auto-detected from last SIP</p>
                )}
              </div>

              <div>
                <label htmlFor="expected-return" className="block text-sm font-medium text-muted-foreground mb-2">
                  Expected Return (% p.a.)
                </label>
                <input
                  id="expected-return"
                  type="number"
                  value={expectedReturn}
                  onChange={(e) => setExpectedReturn(Number(e.target.value))}
                  className="w-full bg-background border border-input rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  min="0"
                  max="50"
                  step="0.5"
                />
              </div>

              <div>
                <label htmlFor="projection-years" className="block text-sm font-medium text-muted-foreground mb-2">
                  Projection Period (Years)
                </label>
                <input
                  id="projection-years"
                  type="number"
                  value={projectionYears}
                  onChange={(e) => setProjectionYears(Number(e.target.value))}
                  className="w-full bg-background border border-input rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  min="1"
                  max="40"
                />
              </div>

              <div>
                <label htmlFor="sip-growth" className="block text-sm font-medium text-muted-foreground mb-2">
                  SIP Growth (% p.a.)
                </label>
                <input
                  id="sip-growth"
                  type="number"
                  value={sipGrowthRate}
                  onChange={(e) => setSipGrowthRate(Number(e.target.value))}
                  className="w-full bg-background border border-input rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  min="0"
                  max="20"
                  step="1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {sipGrowthRate === 0 ? 'No annual increase' : `SIP increases ${sipGrowthRate}% yearly`}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Projection Results */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
              className="glass rounded-xl border border-white/10 p-6 shadow-lg"
            >
              <div className="text-sm font-medium text-muted-foreground mb-1">Total Investment</div>
              <div className="text-2xl font-bold">{formatCurrency(projection.invested)}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {projectionYears * 12} months @ ₹{formatCurrencyShort(activeMonthlySIP)}/mo
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 }}
              className="glass rounded-xl border border-white/10 p-6 shadow-lg"
            >
              <div className="text-sm font-medium text-muted-foreground mb-1">Projected Value</div>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(projection.value)}</div>
              <div className="text-sm text-muted-foreground mt-1">After {projectionYears} years</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.7 }}
              className="glass rounded-xl border border-white/10 p-6 shadow-lg"
            >
              <div className="text-sm font-medium text-muted-foreground mb-1">Projected Returns</div>
              <div className="text-2xl font-bold text-blue-600">{formatCurrency(projection.returns)}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {((projection.returns / projection.invested) * 100).toFixed(1)}% overall gain
              </div>
            </motion.div>
          </div>

          {/* Investment Growth Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-semibold">Investment Growth Path</h3>
                <p className="text-xs text-muted-foreground mt-1">Blue: Principal Invested | Green: Portfolio Value (with gains)</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {[
                  { label: '1Y', years: 1 },
                  { label: '3Y', years: 3 },
                  { label: '5Y', years: 5 },
                  { label: '10Y', years: 10 },
                  { label: '20Y', years: 20 },
                  { label: '30Y', years: 30 },
                ].map((preset) => (
                  <button
                    key={preset.years}
                    onClick={() => setProjectionYears(preset.years)}
                    className={`px-3 py-1 rounded-full border-2 font-semibold text-xs transition ${
                      projectionYears === preset.years
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-border bg-transparent text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-96" style={{ height: '384px' }}>
              <ResponsiveContainer width="100%" height={384}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorInvested" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis 
                    dataKey="month" 
                    stroke="#9ca3af" 
                    tick={{ fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    stroke="#9ca3af" 
                    tickFormatter={(v) => formatCurrencyShort(v)} 
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      background: 'rgba(0,0,0,0.9)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                    labelStyle={{ color: '#9ca3af' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="invested"
                    name="Invested Amount"
                    stroke="#60a5fa"
                    fill="url(#colorInvested)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    name="Portfolio Value"
                    stroke="#34d399"
                    fill="url(#colorValue)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-border">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Current Invested</p>
                  <p className="text-xl font-bold text-blue-600">
                    {isLoading ? '...' : formatCurrency(totalHistoricalInvested)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Current Value</p>
                  <p className="text-xl font-bold text-emerald-600">
                    {isLoading ? '...' : formatCurrency(currentBalance)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Future Invested</p>
                  <p className="text-xl font-bold text-blue-600">
                    {isLoading ? '...' : formatCurrency(projection.invested)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Future Value</p>
                  <p className="text-xl font-bold text-emerald-600">
                    {isLoading ? '...' : formatCurrency(projection.value)}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  )
}
