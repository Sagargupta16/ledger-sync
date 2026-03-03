import { motion } from 'framer-motion'
import { rawColors } from '@/constants/colors'
import { staggerContainer, fadeUpItem } from '@/constants/animations'
import { TrendingUp, TrendingDown, Banknote, Receipt, Activity } from 'lucide-react'
import { useAccountBalances, useMonthlyAggregation } from '@/hooks/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Line, PieChart, Pie, Legend,
} from 'recharts'
import {
  chartTooltipProps, PageHeader, ChartContainer,
  GRID_DEFAULTS, xAxisDefaults, yAxisDefaults,
  areaGradient, areaGradientUrl, shouldAnimate, BAR_RADIUS, ACTIVE_DOT, LEGEND_DEFAULTS,
} from '@/components/ui'
import { useMemo, useCallback } from 'react'
import { formatCurrency, formatCurrencyShort, formatPercent } from '@/lib/formatters'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { getDateKey } from '@/lib/dateUtils'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'
import { getChartColor } from '@/constants/chartColors'

// ─── Helpers (unchanged business logic) ─────────────────────────────────────

const INVESTMENT_KEYWORDS = ['invest', 'mutual', 'stock', 'equity', 'sip', 'portfolio', 'fund', 'demat']

const isInvestmentAccount = (accountName: string): boolean => {
  const lower = accountName.toLowerCase()
  return INVESTMENT_KEYWORDS.some(keyword => lower.includes(keyword))
}

const calculateCAGR = (endingValue: number, beginningValue: number, years: number): number => {
  if (beginningValue <= 0 || years <= 0) return 0
  return (Math.pow(endingValue / beginningValue, 1 / years) - 1) * 100
}

function isInvestmentIncome(lower: string): boolean {
  return lower.includes('dividend') || lower.includes('divid') ||
    lower.includes('interest') || lower.includes('int.') ||
    lower.includes('int cr') || lower.includes('int credit') ||
    lower.includes('profit') || lower.includes('gain') ||
    lower.includes('realized')
}

function isBrokerFee(lower: string): boolean {
  return (lower.includes('broker') && (lower.includes('charge') || lower.includes('fee'))) ||
    lower.includes('brokerage') ||
    (lower.includes('demat') && lower.includes('charge')) ||
    (lower.includes('trading') && (lower.includes('charge') || lower.includes('fee'))) ||
    (lower.includes('transaction') && lower.includes('charge'))
}

function isInvestmentLoss(lower: string): boolean {
  return !lower.includes('broker') && !lower.includes('brokerage') &&
    (lower.includes('loss') || lower.includes('write'))
}

type TxLike = { type: string; amount: number; category: string; note?: string; subcategory?: string }

function txText(tx: TxLike) { return `${tx.category} ${tx.note || ''} ${tx.subcategory || ''}`.toLowerCase() }

function filterByKeyword(transactions: TxLike[], type: string, test: (lower: string) => boolean, investOnly = false): number {
  return transactions
    .filter((tx) => {
      if (tx.type !== type) return false
      const lower = txText(tx)
      if (investOnly) {
        const cat = tx.category.toLowerCase()
        if (!cat.includes('investment') && !cat.includes('stock') && !cat.includes('trading')) return false
      }
      return test(lower)
    })
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
}

function computeInvestmentMetrics(transactions: TxLike[]) {
  const dividendIncome = filterByKeyword(transactions, 'Income', l => l.includes('dividend') || l.includes('divid'))
  const interestIncome = filterByKeyword(transactions, 'Income', l => l.includes('interest') || l.includes('int.') || l.includes('int cr'))
  const investmentProfit = filterByKeyword(transactions, 'Income', l => l.includes('profit') || l.includes('gain') || l.includes('realized'))
  const brokerFees = filterByKeyword(transactions, 'Expense', isBrokerFee, true)
  const investmentLoss = filterByKeyword(transactions, 'Expense', isInvestmentLoss, true)
  const totalIncome = investmentProfit + dividendIncome + interestIncome
  const totalExpenses = investmentLoss + brokerFees
  return { dividendIncome, brokerFees, interestIncome, investmentProfit, investmentLoss, netProfitLoss: totalIncome - totalExpenses }
}

// Group transactions by month for the combo chart
function groupTransactionsByMonth(
  transactions: Array<{ date: string } & TxLike>,
): Array<{ month: string; income: number; expenses: number; net: number; cumulative: number }> {
  const monthly: Record<string, { income: number; expenses: number }> = {}
  for (const tx of transactions) {
    const monthKey = tx.date.substring(0, 7)
    if (!monthly[monthKey]) monthly[monthKey] = { income: 0, expenses: 0 }
    const lower = txText(tx)
    const cat = tx.category.toLowerCase()
    const amount = Math.abs(tx.amount)
    if (tx.type === 'Income' && isInvestmentIncome(lower)) monthly[monthKey].income += amount
    const isInvCat = cat.includes('investment') || cat.includes('stock') || cat.includes('trading')
    if (tx.type === 'Expense' && isInvCat && (isBrokerFee(lower) || isInvestmentLoss(lower))) monthly[monthKey].expenses += amount
  }
  const sorted = Object.keys(monthly).sort((a, b) => a.localeCompare(b))
  let cumulative = 0
  return sorted.map(m => {
    const net = monthly[m].income - monthly[m].expenses
    cumulative += net
    return {
      month: new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      income: Math.round(monthly[m].income),
      expenses: Math.round(monthly[m].expenses),
      net: Math.round(net),
      cumulative: Math.round(cumulative),
    }
  })
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ReturnsAnalysisPage() {
  const { data: balanceData, isLoading: balancesLoading } = useAccountBalances()
  const { data: aggregationData, isLoading: aggregationLoading } = useMonthlyAggregation()
  const { data: allTransactions = [] } = useTransactions()
  const isLoading = balancesLoading || aggregationLoading
  const { dateRange, timeFilterProps } = useAnalyticsTimeFilter(allTransactions)

  const transactions = useMemo(() => {
    if (!dateRange.start_date) return allTransactions
    return allTransactions.filter(tx => {
      const txDate = getDateKey(tx.date)
      return txDate >= dateRange.start_date! && (!dateRange.end_date || txDate <= dateRange.end_date)
    })
  }, [allTransactions, dateRange])

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

  const { dividendIncome, brokerFees, interestIncome, investmentProfit, investmentLoss, netProfitLoss } =
    useMemo(() => computeInvestmentMetrics(transactions), [transactions])

  const totalIncome = investmentProfit + dividendIncome + interestIncome
  const totalExpenses = investmentLoss + brokerFees

  const monthlyDataArray = useMemo(() => {
    const data = Object.entries(aggregationData || {})
      .map(([month, value]) => ({ month, ...(value as { income?: number; expense?: number }) }))
      .sort((a, b) => a.month.localeCompare(b.month))
    return data
  }, [aggregationData])

  const estimatedCAGR = useMemo(() => {
    if (monthlyDataArray.length < 2) return 0
    const first = monthlyDataArray[0]
    const last = monthlyDataArray[monthlyDataArray.length - 1]
    const years = monthlyDataArray.length / 12
    return calculateCAGR(last.income || 1, first.income || 1, Math.max(years, 0.1))
  }, [monthlyDataArray])

  // ── Chart data ──────────────────────────────────────────────────────────

  // 1. Monthly combo chart: bars for monthly P&L + cumulative line
  const monthlyComboData = useMemo(() => groupTransactionsByMonth(transactions), [transactions])

  // 2. Donut chart: P&L composition
  const compositionData = useMemo(() => [
    { name: 'Profit', value: investmentProfit, color: rawColors.ios.green },
    { name: 'Dividends', value: dividendIncome, color: rawColors.ios.teal },
    { name: 'Interest', value: interestIncome, color: rawColors.ios.blue },
    { name: 'Losses', value: investmentLoss, color: rawColors.ios.red },
    { name: 'Fees', value: brokerFees, color: rawColors.ios.orange },
  ].filter(d => d.value > 0), [investmentProfit, dividendIncome, interestIncome, investmentLoss, brokerFees])

  // 3. Monthly returns heatmap
  const monthlyReturns = useMemo(() => {
    return monthlyComboData.map(d => ({
      month: d.month,
      net: d.net,
    }))
  }, [monthlyComboData])

  const roi = monthlyDataArray.length > 0 ? estimatedCAGR / 12 : 0

  // ── Tooltip ─────────────────────────────────────────────────────────────

  const renderComboTooltip = useCallback(({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey?: string; value?: number; color?: string }>; label?: string }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ backgroundColor: 'rgba(26,26,28,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 16px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
        <p style={{ color: '#a1a1aa', fontSize: 12, marginBottom: 6 }}>{label}</p>
        {payload.map((p) => {
          const val = p.value ?? 0
          const labels: Record<string, string> = { income: 'Income', expenses: 'Expenses', net: 'Net', cumulative: 'Cumulative' }
          return (
            <div key={p.dataKey ?? p.color} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
              <span style={{ color: '#71717a', fontSize: 11 }}>{labels[p.dataKey ?? ''] ?? p.dataKey}</span>
              <span style={{ color: '#fafafa', fontSize: 12, fontWeight: 600, marginLeft: 'auto' }}>{formatCurrency(val)}</span>
            </div>
          )
        })}
      </div>
    )
  }, [])

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Returns Analysis"
          subtitle="Analyze your investment returns over time"
          action={<AnalyticsTimeFilter {...timeFilterProps} />}
        />

        {/* ── Hero Section: Big Net P&L + Composition Donut ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: Hero metric + quick stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-3 glass rounded-xl p-6"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className={`p-4 rounded-2xl ${netProfitLoss >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {netProfitLoss >= 0
                  ? <TrendingUp className="w-8 h-8 text-green-400" />
                  : <TrendingDown className="w-8 h-8 text-red-400" />}
              </div>
              <div>
                <p className="text-sm text-zinc-500">Net Investment P&L</p>
                <p className={`text-4xl font-bold tracking-tight ${netProfitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {netProfitLoss >= 0 ? '+' : ''}{formatCurrency(netProfitLoss)}
                </p>
              </div>
            </div>
            {/* Quick stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'CAGR', value: isLoading ? '...' : formatPercent(estimatedCAGR), color: estimatedCAGR >= 0 ? 'text-green-400' : 'text-red-400' },
                { label: 'Monthly ROI', value: isLoading ? '...' : formatPercent(roi), color: roi >= 0 ? 'text-green-400' : 'text-red-400' },
                { label: 'Total Income', value: formatCurrencyShort(totalIncome), color: 'text-green-400' },
                { label: 'Total Costs', value: formatCurrencyShort(totalExpenses), color: 'text-red-400' },
              ].map(stat => (
                <div key={stat.label} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">{stat.label}</p>
                  <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right: P&L Composition Donut */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2 glass rounded-xl p-6"
          >
            <p className="text-sm font-medium text-zinc-300 mb-2">P&L Composition</p>
            {compositionData.length === 0 ? (
              <ChartEmptyState height={220} />
            ) : (
              <ChartContainer height={220}>
                <PieChart>
                  <Pie
                    data={compositionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="50%"
                    outerRadius="78%"
                    paddingAngle={3}
                    strokeWidth={0}
                    isAnimationActive={shouldAnimate(compositionData.length)}
                    animationDuration={600}
                  >
                    {compositionData.map((d, i) => (
                      <Cell key={d.name} fill={d.color ?? getChartColor(i)} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(v: number | undefined) => formatCurrency(v ?? 0)}
                  />
                  <Legend
                    {...LEGEND_DEFAULTS}
                    layout="horizontal"
                    align="center"
                    verticalAlign="bottom"
                  />
                </PieChart>
              </ChartContainer>
            )}
          </motion.div>
        </div>

        {/* ── Monthly P&L Combo Chart: Bars + Cumulative Line ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <Activity className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="text-lg font-semibold text-zinc-200">Monthly Investment P&L</h3>
              <p className="text-xs text-zinc-500">Bars show monthly net, line shows cumulative growth</p>
            </div>
          </div>
          {monthlyComboData.length === 0 ? (
            <ChartEmptyState height={360} />
          ) : (
            <ChartContainer height={360}>
              <BarChart data={monthlyComboData} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
                <defs>
                  {areaGradient('cumLine', rawColors.ios.blue, 0.15, 0)}
                </defs>
                <CartesianGrid {...GRID_DEFAULTS} />
                <XAxis {...xAxisDefaults(monthlyComboData.length)} dataKey="month" />
                <YAxis {...yAxisDefaults()} />
                <Tooltip content={renderComboTooltip as never} cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }} />
                {/* Monthly net bars — green for positive, red for negative */}
                <Bar dataKey="net" name="Net" radius={BAR_RADIUS} maxBarSize={32}
                  isAnimationActive={shouldAnimate(monthlyComboData.length)} animationDuration={600} animationEasing="ease-out"
                >
                  {monthlyComboData.map((d) => (
                    <Cell key={d.month} fill={d.net >= 0 ? rawColors.ios.green : rawColors.ios.red} fillOpacity={0.7} />
                  ))}
                </Bar>
                {/* Cumulative line overlay */}
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  name="Cumulative"
                  stroke={rawColors.ios.blue}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ ...ACTIVE_DOT, fill: rawColors.ios.blue }}
                  isAnimationActive={shouldAnimate(monthlyComboData.length)}
                  animationDuration={800}
                />
              </BarChart>
            </ChartContainer>
          )}
        </motion.div>

        {/* ── Monthly Returns Heatmap Strip ── */}
        {monthlyReturns.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass rounded-xl p-6"
          >
            <p className="text-sm font-medium text-zinc-300 mb-4">Monthly Performance</p>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {monthlyReturns.map((m) => {
                const maxAbs = Math.max(...monthlyReturns.map(r => Math.abs(r.net)), 1)
                const intensity = Math.min(Math.abs(m.net) / maxAbs, 1)
                const bg = m.net >= 0
                  ? `rgba(48, 209, 88, ${intensity * 0.5 + 0.08})`
                  : `rgba(255, 87, 87, ${intensity * 0.5 + 0.08})`
                return (
                  <div
                    key={m.month}
                    className="flex-1 min-w-[56px] rounded-lg p-2.5 text-center transition-colors hover:ring-1 hover:ring-white/10"
                    style={{ backgroundColor: bg }}
                    title={`${m.month}: ${formatCurrency(m.net)}`}
                  >
                    <p className="text-[10px] text-zinc-400 mb-1">{m.month}</p>
                    <p className={`text-xs font-bold ${m.net >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                      {m.net >= 0 ? '+' : ''}{formatCurrencyShort(m.net)}
                    </p>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* ── Cumulative Returns Area Chart ── */}
        {monthlyComboData.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="glass rounded-xl p-6"
          >
            <h3 className="text-lg font-semibold text-zinc-200 mb-6">Cumulative Returns</h3>
            <ChartContainer height={280}>
              <AreaChart data={monthlyComboData} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
                <defs>
                  {areaGradient('cumArea', rawColors.ios.blue)}
                </defs>
                <CartesianGrid {...GRID_DEFAULTS} />
                <XAxis {...xAxisDefaults(monthlyComboData.length)} dataKey="month" />
                <YAxis {...yAxisDefaults()} />
                <Tooltip {...chartTooltipProps} formatter={(v: number | undefined) => formatCurrency(v ?? 0)} />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke={rawColors.ios.blue}
                  strokeWidth={2}
                  fill={areaGradientUrl('cumArea')}
                  fillOpacity={1}
                  dot={false}
                  activeDot={{ ...ACTIVE_DOT, fill: rawColors.ios.blue }}
                  isAnimationActive={shouldAnimate(monthlyComboData.length)}
                  animationDuration={800}
                />
              </AreaChart>
            </ChartContainer>
          </motion.div>
        )}

        {/* ── P&L Breakdown: Income vs Expenses ── */}
        {investmentAccounts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass rounded-xl p-6"
          >
            <h3 className="text-lg font-semibold text-zinc-200 mb-6">Detailed Breakdown</h3>
            <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-4" initial="hidden" animate="visible" variants={staggerContainer}>
              <motion.div variants={fadeUpItem} className="bg-green-500/5 border border-green-500/15 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Banknote className="w-4 h-4 text-green-400" />
                  <p className="text-sm font-medium text-zinc-300">Income Sources</p>
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'Investment Profit', value: investmentProfit, color: 'text-green-400' },
                    { label: 'Dividend Income', value: dividendIncome, color: 'text-green-400' },
                    { label: 'Interest Income', value: interestIncome, color: 'text-teal-400' },
                  ].map(item => (
                    <div key={item.label}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-zinc-400">{item.label}</span>
                        <span className={`text-sm font-semibold ${item.color}`}>{formatCurrency(item.value)}</span>
                      </div>
                      {totalIncome > 0 && (
                        <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${(item.value / totalIncome) * 100}%`, backgroundColor: rawColors.ios.green }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-green-500/10 pt-3">
                    <span className="text-sm font-semibold text-zinc-200">Total</span>
                    <span className="text-lg font-bold text-green-400">{formatCurrency(totalIncome)}</span>
                  </div>
                </div>
              </motion.div>
              <motion.div variants={fadeUpItem} className="bg-red-500/5 border border-red-500/15 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Receipt className="w-4 h-4 text-red-400" />
                  <p className="text-sm font-medium text-zinc-300">Costs & Losses</p>
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'Investment Loss', value: investmentLoss, color: 'text-red-400' },
                    { label: 'Broker Fees', value: brokerFees, color: 'text-orange-400' },
                  ].map(item => (
                    <div key={item.label}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-zinc-400">{item.label}</span>
                        <span className={`text-sm font-semibold ${item.color}`}>{formatCurrency(item.value)}</span>
                      </div>
                      {totalExpenses > 0 && (
                        <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${(item.value / totalExpenses) * 100}%`, backgroundColor: rawColors.ios.red }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-red-500/10 pt-3">
                    <span className="text-sm font-semibold text-zinc-200">Total</span>
                    <span className="text-lg font-bold text-red-400">{formatCurrency(totalExpenses)}</span>
                  </div>
                </div>
              </motion.div>
            </motion.div>
            {/* Net P&L footer */}
            <div className="mt-4 bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-zinc-200">Net Profit/Loss</span>
                <span className={`text-2xl font-bold ${netProfitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {netProfitLoss >= 0 ? '+' : ''}{formatCurrency(netProfitLoss)}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
