import { motion } from 'framer-motion'
import { TrendingUp, Calculator, Calendar } from 'lucide-react'
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
import { formatCurrency, formatCurrencyShort, formatPercent } from '@/lib/formatters'

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

// SIP Calculator function with annual SIP change
const calculateSIPProjection = (
  monthlyAmount: number,
  annualRate: number,
  years: number,
  sipGrowthRate: number,
  startingCorpus: number,
) => {
  const monthlyRate = annualRate / 12 / 100
  let invested = startingCorpus
  let value = startingCorpus
  let currentSip = monthlyAmount

  for (let i = 1; i <= years * 12; i++) {
    invested += currentSip
    value = (value + currentSip) * (1 + monthlyRate)

    // at year boundary apply growth to SIP
    if (i % 12 === 0 && sipGrowthRate !== 0) {
      currentSip = currentSip * (1 + sipGrowthRate / 100)
    }
  }

  return { value, invested, returns: value - invested }
}

export default function MutualFundProjectionPage() {
  const { data: balanceData, isLoading } = useAccountBalances()
  const { data: transactions = [] } = useTransactions()
  const [sipAmount, setSipAmount] = useState(10000)
  const [returnRate, setReturnRate] = useState(12)
  const [tillDateReturn, setTillDateReturn] = useState(12) // Till date return %
  const [sipYears, setSipYears] = useState(10)
  const [sipGrowthRate, setSipGrowthRate] = useState(0) // annual change in SIP %
  const [userSetSip, setUserSetSip] = useState(false)
  const [investmentAccounts, setInvestmentAccounts] = useState<{ name: string; balance: number }[]>([])
  const [showProjection, setShowProjection] = useState(true) // Toggle projection visibility

  // Load only mutual fund classified accounts
  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const { accounts: classified } = await accountClassificationsService.getAccountsByType('Investments')
        const accounts = Object.entries(balanceData?.accounts || {})
          .filter(([name]) => classified.includes(name))
          .filter(([name]) => {
            const n = name.toLowerCase()
            return n.includes('mutual') || n.includes('fund')
          })
          .map(([name, data]) => ({
            name,
            balance: Math.abs((data as { balance: number; transactions: number }).balance),
          }))
          .sort((a, b) => b.balance - a.balance)

        setInvestmentAccounts(accounts)
      } catch {
        setInvestmentAccounts([])
      }
    }

    loadAccounts()
  }, [balanceData])

  const targetAccountName = useMemo(() => {
    const groww = investmentAccounts.find((a) => a.name.toLowerCase().includes('groww'))
    if (groww) return groww.name
    const mf = investmentAccounts.find((a) => a.name.toLowerCase().includes('mutual'))
    if (mf) return mf.name
    return investmentAccounts[0]?.name || ''
  }, [investmentAccounts])

  // Capture any transaction that is clearly a Groww MF transfer (either account is Groww MF, or category/note mentions it)
  const growwTransactions = useMemo(() => {
    const containsGroww = (text?: string) => !!text && text.toLowerCase().includes('grow mutual funds')
    return transactions.filter((tx) => {
      const accountHit = tx.account?.toLowerCase() === targetAccountName.toLowerCase()
      const categoryHit = containsGroww(tx.category)
      const noteHit = containsGroww(tx.note)
      return accountHit || categoryHit || noteHit
    })
  }, [transactions, targetAccountName])

  // Treat Transfer to investment account as SIP contributions
  // If none exist, fallback to all with Groww hit using sign heuristic.
  // React Compiler will optimize this automatically
  const getInflowTransactions = () => {
    if (!growwTransactions.length) return []
    
    // Filter transfers where to_account is the investment account (Grow Mutual Funds)
    const transferToInvestment = growwTransactions.filter(
      (tx) => tx.type === 'Transfer' && tx.to_account?.toLowerCase().includes('grow')
    )
    
    if (transferToInvestment.length) return transferToInvestment.map((tx) => ({ ...tx, amount: Math.abs(tx.amount) }))

    const hasPositive = growwTransactions.some((tx) => tx.amount > 0)
    if (hasPositive) return growwTransactions.filter((tx) => tx.amount > 0)

    return growwTransactions.map((tx) => ({ ...tx, amount: Math.abs(tx.amount) }))
  }
  const inflowTransactions = getInflowTransactions()

  const currentInvested = inflowTransactions.reduce((sum, tx) => sum + tx.amount, 0)

  const lastSipAmount = useMemo(() => {
    if (!inflowTransactions.length) return 0
    const latest = inflowTransactions.reduce<{ date: number; amount: number } | null>((acc, tx) => {
      const ts = new Date(tx.date).getTime()
      if (!acc || ts > acc.date) return { date: ts, amount: tx.amount }
      return acc
    }, null)
    return latest?.amount || 0
  }, [inflowTransactions])

  // Use lastSipAmount as initial value if available and user hasn't changed it
  const effectiveSipAmount = !userSetSip && lastSipAmount > 0 ? Math.round(lastSipAmount) : sipAmount

  // Generate projection timeline
  const startYear = useMemo(() => {
    const source = inflowTransactions.length ? inflowTransactions : transactions
    if (!source.length) return new Date().getFullYear()
    const minDate = Math.min(...source.map((t) => new Date(t.date).getTime()))
    return new Date(minDate).getFullYear()
  }, [transactions, inflowTransactions])

  // Calculate SIP projection (uses current invested as starting corpus)
  const projection = useMemo(
    () => calculateSIPProjection(effectiveSipAmount, returnRate, sipYears, sipGrowthRate, currentInvested),
    [effectiveSipAmount, returnRate, sipYears, sipGrowthRate, currentInvested],
  )

  // Chart 1: Combined Investment Timeline + Projection (MONTHLY basis)
  // Shows actual investments monthly + monthly projection with gains as stacked area
  const combinedChartData = useMemo(() => {
    const monthlyData: Array<{ month: string; invested: number; gains: number; isToday?: boolean }> = []

    // Calculate data point interval based on sipYears FIRST
    const dataPointInterval = Math.max(1, Math.floor(sipYears))

    // First, add actual investment transactions (monthly cumulative)
    if (inflowTransactions.length > 0) {
      const sorted = [...inflowTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      let cumulative = 0
      const monthMap = new Map<string, number>()

      // Group transactions by month and calculate cumulative
      sorted.forEach((tx) => {
        const date = new Date(tx.date)
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        cumulative += tx.amount
        monthMap.set(monthKey, cumulative)
      })

      // Convert to array with formatted dates and apply interval
      const monthArray = Array.from(monthMap.entries())
      monthArray.forEach((entry, index) => {
        const [key, value] = entry
        const [year, month] = key.split('-')
        const monthName = new Date(Number.parseInt(year), Number.parseInt(month) - 1).toLocaleDateString('en-IN', { month: 'short', day: '2-digit', year: '2-digit' })
        
        // Add data point if it matches the interval (e.g., every 2nd, 3rd, 5th month, etc.)
        if ((index + 1) % dataPointInterval === 0 || index === monthArray.length - 1) {
          // Calculate gains based on till date return
          const gains = Math.max(0, value * (tillDateReturn / 100))
          monthlyData.push({
            month: monthName,
            invested: value,
            gains,
          })
        }
      })
    }

    // Mark last SIP transaction position
    const lastInvested = monthlyData.length > 0 ? monthlyData.at(-1)?.invested || currentInvested : currentInvested
    
    // Mark the last transaction as the transition point
    if (monthlyData.length > 0) {
      const lastEntry = monthlyData.at(-1)
      if (lastEntry) lastEntry.isToday = true
    }

    // Then project forward monthly (only if showProjection)
    if (showProjection) {
      // Start projection from the last data point value (invested + gains so far)
      const lastDataPoint = monthlyData.at(-1)
      const lastGains = lastDataPoint?.gains || 0
      let value = lastInvested + lastGains
      let invested = lastInvested
      let currentSip = effectiveSipAmount
      const monthlyRate = returnRate / 12 / 100

      // Calculate starting point for projection
      const lastMonthStr = monthlyData.at(-1)?.month
      let projStartDate = new Date(startYear, 0)
      
      if (lastMonthStr) {
        const parts = lastMonthStr.split(' ')
        const monthStr = parts[0]
        const yearStr = parts[2] // day is at index 1, year at index 2
        const monthIdx = new Date(`${monthStr} 1 20${yearStr}`).getMonth()
        const yearNum = 2000 + Number.parseInt(yearStr)
        projStartDate = new Date(yearNum, monthIdx)
      }

      for (let i = 1; i <= sipYears * 12; i++) {
        // Add monthly returns and SIP
        invested += currentSip
        value = (value + currentSip) * (1 + monthlyRate)
        const gains = Math.max(0, value - invested)

        // Apply annual SIP growth every 12 months
        if (i % 12 === 0) {
          currentSip = currentSip * (1 + sipGrowthRate / 100)
        }

        // Add to chart at interval matching sipYears (every dataPointInterval months)
        if (i % dataPointInterval === 0) {
          const projDate = new Date(projStartDate)
          projDate.setMonth(projDate.getMonth() + i)
          const monthName = projDate.toLocaleDateString('en-IN', { month: 'short', day: '2-digit', year: '2-digit' })
          monthlyData.push({
            month: monthName,
            invested,
            gains,
          })
        }
      }
    }

    return monthlyData
  }, [inflowTransactions, currentInvested, effectiveSipAmount, returnRate, tillDateReturn, sipGrowthRate, sipYears, startYear, showProjection])

  return (
    <>
      <style>{hideSpinnersStyle}</style>
      <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent drop-shadow-lg">
            SIP Projections
          </h1>
          <p className="text-muted-foreground mt-2">Calculate future value of your Systematic Investment Plans</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/20 rounded-xl shadow-lg shadow-primary/30">
                <Calculator className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Projected Value</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : formatCurrency(projection.value)}
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
                <Calendar className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Expected Returns</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : formatCurrency(projection.returns)}
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
              <div className="p-3 bg-green-500/20 rounded-xl shadow-lg shadow-green-500/30">
                <TrendingUp className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current Invested</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : formatCurrency(currentInvested)}
                </p>
                <p className="text-xs text-gray-500">Groww mutual fund inflows</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* SIP CALCULATOR - Moved before chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <h3 className="text-lg font-semibold text-white mb-6">SIP Calculator</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
            <div>
              <label htmlFor="sip-amount" className="block text-sm font-medium text-gray-400 mb-2">Monthly SIP Amount</label>
              <input
                id="sip-amount"
                type="number"
                value={effectiveSipAmount}
                onChange={(e) => {
                  setUserSetSip(true)
                  setSipAmount(Number(e.target.value))
                }}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
              />
              <p className="text-xs text-gray-500 mt-1">{formatCurrency(effectiveSipAmount)}/month</p>
              {lastSipAmount > 0 ? (
                <p className="text-[11px] text-gray-500">Last SIP: {formatCurrency(lastSipAmount)}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="return-rate" className="block text-sm font-medium text-gray-400 mb-2">Expected Annual Return (%)</label>
              <input
                id="return-rate"
                type="number"
                value={returnRate}
                onChange={(e) => setReturnRate(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
              />
              <p className="text-xs text-gray-500 mt-1">{formatPercent(returnRate)} p.a.</p>
            </div>
            <div>
              <label htmlFor="till-date-return" className="block text-sm font-medium text-gray-400 mb-2">Till Date Return (%)</label>
              <input
                id="till-date-return"
                type="number"
                value={tillDateReturn}
                onChange={(e) => setTillDateReturn(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
              />
              <p className="text-xs text-gray-500 mt-1">{formatPercent(tillDateReturn)} gained so far</p>
            </div>
            <div>
              <label htmlFor="years-input" className="block text-sm font-medium text-gray-400 mb-2">Years</label>
              <input
                id="years-input"
                type="number"
                value={sipYears}
                onChange={(e) => setSipYears(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
              />
              <p className="text-xs text-gray-500 mt-1">{sipYears} years</p>
            </div>
            <div>
              <label htmlFor="sip-growth" className="block text-sm font-medium text-gray-400 mb-2">Annual SIP Change (%)</label>
              <input
                id="sip-growth"
                type="number"
                value={sipGrowthRate}
                onChange={(e) => setSipGrowthRate(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
              />
              <p className="text-xs text-gray-500 mt-1">Increase/decrease SIP each year</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Investment Growth Path</h3>
              <p className="text-xs text-gray-500 mt-1">Blue: Amount Invested | Green: Expected Gains</p>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <button
                onClick={() => setShowProjection(!showProjection)}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
                  showProjection
                    ? 'bg-purple-500/20 border border-purple-400 text-purple-300'
                    : 'bg-white/5 border border-white/10 text-gray-400 hover:border-white/20'
                }`}
              >
                {showProjection ? 'Projection: ON' : 'Projection: OFF'}
              </button>
              <div className="flex gap-2">
                {[
                  { label: '1Y', years: 1 },
                  { label: '2Y', years: 2 },
                  { label: '3Y', years: 3 },
                  { label: '5Y', years: 5 },
                  { label: '10Y', years: 10 },
                  { label: '20Y', years: 20 },
                  { label: '30Y', years: 30 },
                ].map((preset) => (
                  <button
                    key={preset.years}
                    onClick={() => setSipYears(preset.years)}
                    className={`px-3 py-1 rounded-full border-2 font-semibold text-xs transition ${
                      sipYears === preset.years
                        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                        : 'border-white/20 bg-transparent text-gray-400 hover:border-white/40'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="h-96" style={{ height: '384px' }}>
            <ResponsiveContainer width="100%" height={384}>
              <AreaChart data={combinedChartData}>
                <defs>
                  <linearGradient id="colorInvested" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="colorGains" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="month" stroke="#9ca3af" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 11 }} />
                <YAxis stroke="#9ca3af" tickFormatter={(v) => formatCurrencyShort(v)} />
                {combinedChartData.find((d) => d.isToday) && (
                  <line x1={combinedChartData.findIndex((d) => d.isToday)} y1={0} x2={combinedChartData.findIndex((d) => d.isToday)} y2={1} stroke="#fbbf24" strokeWidth={2} strokeDasharray="5 5" />
                )}
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    background: '#0b1220',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                  }}
                  labelStyle={{ color: '#9ca3af' }}
                  itemStyle={{ color: '#fff' }}
                  labelFormatter={(label) => label}
                />
                <Legend />
                <Area type="monotone" dataKey="invested" stackId="1" stroke="#60a5fa" fill="url(#colorInvested)" name="Amount Invested" />
                {showProjection && (
                  <Area type="monotone" dataKey="gains" stackId="1" stroke="#34d399" fill="url(#colorGains)" name="Expected Gains" />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-400">Current Invested</p>
                <p className="text-xl font-bold text-blue-400">{isLoading ? '...' : formatCurrency(currentInvested)}</p>
              </div>
              {showProjection && (
                <>
                  <div>
                    <p className="text-xs text-gray-400">Expected Invested</p>
                    <p className="text-xl font-bold text-blue-300">{isLoading ? '...' : formatCurrency(projection.invested)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Expected Gain ({formatPercent(returnRate)})</p>
                    <p className="text-xl font-bold text-green-400">{isLoading ? '...' : formatCurrency(projection.returns)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Future Worth</p>
                    <p className="text-xl font-bold text-emerald-400">{isLoading ? '...' : formatCurrency(projection.value)}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
    </>
  )
}
