import { motion } from 'framer-motion'
import {
  Calendar,
  Flame,
  TrendingDown,
  TrendingUp,
  Sun,
  Moon,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { useState, useMemo } from 'react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { formatCurrency, formatCurrencyCompact, formatCurrencyShort } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'

// ─── Types ──────────────────────────────────────────────────────────
type HeatmapMode = 'expense' | 'income' | 'net'

interface DayCell {
  date: string        // YYYY-MM-DD
  expense: number
  income: number
  net: number
  dayOfWeek: number   // 0-6 (Sun-Sat)
  weekIndex: number
  month: number
  isToday: boolean
  hasTx: boolean
}

// ─── Helpers ────────────────────────────────────────────────────────
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function getIntensityLevel(value: number, max: number): number {
  if (value === 0 || max === 0) return 0
  const ratio = value / max
  if (ratio < 0.15) return 1
  if (ratio < 0.35) return 2
  if (ratio < 0.6) return 3
  return 4
}

const heatmapColors: Record<HeatmapMode, string[]> = {
  expense: [
    'rgba(255,255,255,0.04)',   // 0 – empty
    'rgba(239,68,68,0.20)',     // 1 – light
    'rgba(239,68,68,0.40)',     // 2
    'rgba(239,68,68,0.65)',     // 3
    'rgba(239,68,68,0.90)',     // 4 – intense
  ],
  income: [
    'rgba(255,255,255,0.04)',
    'rgba(34,197,94,0.20)',
    'rgba(34,197,94,0.40)',
    'rgba(34,197,94,0.65)',
    'rgba(34,197,94,0.90)',
  ],
  net: [
    'rgba(255,255,255,0.04)',
    'rgba(59,130,246,0.20)',
    'rgba(59,130,246,0.40)',
    'rgba(59,130,246,0.65)',
    'rgba(59,130,246,0.90)',
  ],
}

const modeAccent: Record<HeatmapMode, string> = {
  expense: rawColors.ios.red,
  income: rawColors.ios.green,
  net: rawColors.ios.blue,
}

// ─── Main Component ─────────────────────────────────────────────────
export default function YearInReviewPage() {
  const { data: transactions = [] } = useTransactions()
  const { data: _preferences } = usePreferences()

  const [mode, setMode] = useState<HeatmapMode>('expense')
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())
  const [hoveredDay, setHoveredDay] = useState<DayCell | null>(null)

  // ── Available years ──────────────────────────────────────────
  const availableYears = useMemo(() => {
    const years = new Set<number>()
    for (const tx of transactions) {
      years.add(new Date(tx.date).getFullYear())
    }
    if (years.size === 0) years.add(new Date().getFullYear())
    return Array.from(years).sort((a, b) => b - a)
  }, [transactions])

  // ── Build 365-day grid ───────────────────────────────────────
  const { grid, maxExpense, maxIncome, maxNet, monthLabels } = useMemo(() => {
    // Aggregate spending and income per day
    const dayExpenses: Record<string, number> = {}
    const dayIncomes: Record<string, number> = {}

    for (const tx of transactions) {
      const d = tx.date.substring(0, 10)
      const year = Number.parseInt(d.substring(0, 4))
      if (year !== selectedYear) continue

      if (tx.type === 'Expense') {
        dayExpenses[d] = (dayExpenses[d] || 0) + Math.abs(tx.amount)
      } else if (tx.type === 'Income') {
        dayIncomes[d] = (dayIncomes[d] || 0) + Math.abs(tx.amount)
      }
    }

    // Generate all days of the year
    const jan1 = new Date(selectedYear, 0, 1)
    const dec31 = new Date(selectedYear, 11, 31)
    const todayStr = new Date().toISOString().substring(0, 10)
    const startDow = jan1.getDay()

    const cells: DayCell[] = []
    let mxE = 0
    let mxI = 0
    let mxN = 0

    const current = new Date(jan1)
    while (current <= dec31) {
      const dateStr = current.toISOString().substring(0, 10)
      const dayOfYear = Math.floor((current.getTime() - jan1.getTime()) / 86400000)
      const weekIndex = Math.floor((dayOfYear + startDow) / 7)
      const exp = dayExpenses[dateStr] || 0
      const inc = dayIncomes[dateStr] || 0
      const net = inc - exp

      if (exp > mxE) mxE = exp
      if (inc > mxI) mxI = inc
      const absNet = Math.abs(net)
      if (absNet > mxN) mxN = absNet

      cells.push({
        date: dateStr,
        expense: exp,
        income: inc,
        net,
        dayOfWeek: current.getDay(),
        weekIndex,
        month: current.getMonth(),
        isToday: dateStr === todayStr,
        hasTx: exp > 0 || inc > 0,
      })
      current.setDate(current.getDate() + 1)
    }

    // Month labels at week positions
    const labels: { month: string; weekIndex: number }[] = []
    let prevMonth = -1
    for (const cell of cells) {
      if (cell.month !== prevMonth && cell.dayOfWeek === 0) {
        labels.push({ month: MONTHS_SHORT[cell.month], weekIndex: cell.weekIndex })
        prevMonth = cell.month
      }
    }
    // Ensure Jan is included
    if (labels.length === 0 || labels[0].month !== 'Jan') {
      labels.unshift({ month: 'Jan', weekIndex: 0 })
    }

    return { grid: cells, maxExpense: mxE, maxIncome: mxI, maxNet: mxN, monthLabels: labels }
  }, [transactions, selectedYear])

  // Resolve the correct max based on mode
  const modeMaxMap: Record<HeatmapMode, number> = { expense: maxExpense, income: maxIncome, net: maxNet }
  const modeMax = modeMaxMap[mode]

  // ── Summary statistics ───────────────────────────────────────
  const stats = useMemo(() => {
    let totalExpense = 0
    let totalIncome = 0
    let daysWithExpense = 0
    let biggestExpenseDay = { date: '', amount: 0 }
    let biggestIncomeDay = { date: '', amount: 0 }
    let streak = 0
    let maxStreak = 0
    const monthlyExpense: number[] = Array.from({ length: 12 }, () => 0)
    const monthlyIncome: number[] = Array.from({ length: 12 }, () => 0)

    for (const cell of grid) {
      totalExpense += cell.expense
      totalIncome += cell.income
      monthlyExpense[cell.month] += cell.expense
      monthlyIncome[cell.month] += cell.income

      if (cell.expense > 0) {
        daysWithExpense++
        if (cell.expense > biggestExpenseDay.amount) {
          biggestExpenseDay = { date: cell.date, amount: cell.expense }
        }
      }
      if (cell.income > biggestIncomeDay.amount) {
        biggestIncomeDay = { date: cell.date, amount: cell.income }
      }

      // No-spend streak
      if (cell.expense === 0 && cell.hasTx) {
        streak++
        if (streak > maxStreak) maxStreak = streak
      } else if (cell.expense > 0) {
        streak = 0
      }
    }

    const bestMonth = monthlyExpense.indexOf(Math.min(...monthlyExpense.filter((e) => e > 0)))
    const worstMonth = monthlyExpense.indexOf(Math.max(...monthlyExpense))
    const dailyAvg = daysWithExpense > 0 ? totalExpense / daysWithExpense : 0

    return {
      totalExpense,
      totalIncome,
      totalSavings: totalIncome - totalExpense,
      savingsRate: totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0,
      daysWithExpense,
      biggestExpenseDay,
      biggestIncomeDay,
      maxStreak,
      dailyAvg,
      bestMonth: bestMonth >= 0 ? MONTHS_SHORT[bestMonth] : 'N/A',
      worstMonth: worstMonth >= 0 ? MONTHS_SHORT[worstMonth] : 'N/A',
      monthlyExpense,
      monthlyIncome,
    }
  }, [grid])

  // Monthly bar data
  const monthlyBarData = useMemo(() => {
    return MONTHS_SHORT.map((m, i) => ({
      name: m,
      Expense: stats.monthlyExpense[i],
      Income: stats.monthlyIncome[i],
    }))
  }, [stats])

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl" style={{ backgroundColor: `${rawColors.ios.purple}22` }}>
              <Calendar className="w-7 h-7" style={{ color: rawColors.ios.purple }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Year in Review</h1>
              <p className="text-sm text-gray-400">
                {selectedYear} financial activity — every day at a glance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Year selector */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 rounded-xl bg-[rgba(44,44,46,0.6)] backdrop-blur-xl border border-white/10 text-sm text-white cursor-pointer hover:bg-[rgba(58,58,60,0.6)] transition-colors"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            {/* Mode Toggle */}
            <div className="flex items-center gap-1 p-1 glass-thin rounded-xl" role="tablist">
              {([
                ['expense', 'Spending', TrendingDown],
                ['income', 'Income', TrendingUp],
                ['net', 'Net', DollarSign],
              ] as const).map(([val, label, Icon]) => (
                <motion.button
                  key={val}
                  role="tab"
                  aria-selected={mode === val}
                  onClick={() => setMode(val)}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    mode === val ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                  whileTap={{ scale: 0.97 }}
                >
                  {mode === val && (
                    <motion.div
                      layoutId="heatmapModeTab"
                      className="absolute inset-0 rounded-lg"
                      style={{ backgroundColor: modeAccent[val] }}
                      initial={false}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <Icon className="w-3.5 h-3.5 relative z-10" />
                  <span className="relative z-10">{label}</span>
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <StatCard label="Total Spending" value={formatCurrencyCompact(stats.totalExpense)} icon={TrendingDown} color={rawColors.ios.red} />
        <StatCard label="Total Income" value={formatCurrencyCompact(stats.totalIncome)} icon={TrendingUp} color={rawColors.ios.green} />
        <StatCard
          label="Savings Rate"
          value={`${stats.savingsRate.toFixed(1)}%`}
          icon={stats.savingsRate >= 0 ? ArrowUpRight : ArrowDownRight}
          color={stats.savingsRate >= 20 ? rawColors.ios.green : rawColors.ios.orange}
        />
        <StatCard label="Daily Average" value={formatCurrencyCompact(stats.dailyAvg)} icon={BarChart3} color={rawColors.ios.blue} />
      </div>

      {/* GitHub-style Heatmap */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-white/10 p-6 shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Flame className="w-5 h-5" style={{ color: modeAccent[mode] }} />
            {{ expense: 'Spending', income: 'Income', net: 'Net' }[mode]} Heatmap — {selectedYear}
          </h2>
          {/* Legend */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>Less</span>
            {heatmapColors[mode].map((color) => (
              <div
                key={color}
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: color }}
              />
            ))}
            <span>More</span>
          </div>
        </div>

        {/* Heatmap Grid */}
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            {/* Month labels row */}
            <div className="flex ml-10 mb-1">
              {monthLabels.map((ml) => (
                <div
                  key={`${ml.month}-${ml.weekIndex}`}
                  className="text-xs text-gray-500"
                  style={{
                    position: 'relative',
                    left: `${ml.weekIndex * 15}px`,
                    width: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ml.month}
                </div>
              ))}
            </div>

            {/* Day rows (7 rows × N weeks) */}
            <div className="flex gap-0.5">
              {/* Day labels */}
              <div className="flex flex-col gap-0.5 mr-1.5 pt-0">
                {DAYS.map((d, i) => (
                  <div key={d} className="h-[13px] flex items-center text-[10px] text-gray-500 leading-none">
                    {i % 2 === 1 ? d : ''}
                  </div>
                ))}
              </div>

              {/* Grid columns (weeks) */}
              <div className="flex gap-0.5">
                {(() => {
                  const totalWeeks = grid.length > 0 ? (grid.at(-1)?.weekIndex ?? 52) + 1 : 53
                  const weeks: React.ReactNode[] = []

                  for (let w = 0; w < totalWeeks; w++) {
                    const weekCells = grid.filter((c) => c.weekIndex === w)
                    weeks.push(
                      <div key={w} className="flex flex-col gap-0.5">
                        {Array.from({ length: 7 }, (_, dow) => {
                          const cell = weekCells.find((c) => c.dayOfWeek === dow)
                          if (!cell) {
                            return <div key={dow} className="w-[13px] h-[13px]" />
                          }
                          const valMap = { expense: cell.expense, income: cell.income, net: Math.abs(cell.net) }
                          const val = valMap[mode]
                          const level = getIntensityLevel(val, modeMax)
                          const bgColor = heatmapColors[mode][level]

                          return (
                            <div
                              key={dow}
                              role="presentation"
                              tabIndex={-1}
                              className="w-[13px] h-[13px] rounded-sm cursor-pointer transition-transform hover:scale-125"
                              style={{
                                backgroundColor: bgColor,
                                outline: cell.isToday ? `2px solid ${modeAccent[mode]}` : 'none',
                                outlineOffset: '-1px',
                              }}
                              onMouseEnter={() => setHoveredDay(cell)}
                              onMouseLeave={() => setHoveredDay(null)}
                            />
                          )
                        })}
                      </div>
                    )
                  }
                  return weeks
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Tooltip for hovered day */}
        {hoveredDay && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 rounded-xl bg-[rgba(17,24,39,0.95)] backdrop-blur-xl border border-white/10 max-w-xs shadow-xl shadow-black/30"
          >
            <p className="text-sm font-medium text-white mb-2">
              {new Date(hoveredDay.date + 'T00:00:00').toLocaleDateString('en-IN', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-red-400">Expense: {formatCurrency(hoveredDay.expense)}</span>
              <span className="text-green-400">Income: {formatCurrency(hoveredDay.income)}</span>
              <span className={hoveredDay.net >= 0 ? 'text-blue-400' : 'text-orange-400'}>
                Net: {hoveredDay.net >= 0 ? '+' : ''}{formatCurrency(hoveredDay.net)}
              </span>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Monthly Breakdown + Insights Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly bar chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 glass rounded-2xl border border-white/10 p-6"
        >
          <h2 className="text-lg font-semibold mb-4">Monthly Breakdown</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={monthlyBarData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tickFormatter={(v: number) => formatCurrencyShort(v)} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <RechartsTooltip
                  formatter={(value: number | undefined) => (value === undefined ? '' : formatCurrency(value))}
                  contentStyle={{ backgroundColor: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', backdropFilter: 'blur(12px)', color: '#fff' }}
                  labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                />
                <Bar dataKey="Expense" fill={rawColors.ios.red} radius={[4, 4, 0, 0]} opacity={0.8} />
                <Bar dataKey="Income" fill={rawColors.ios.green} radius={[4, 4, 0, 0]} opacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Quick insights */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-2xl border border-white/10 p-6 space-y-4"
        >
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Flame className="w-5 h-5" style={{ color: rawColors.ios.orange }} />
            Quick Insights
          </h2>

          <InsightRow icon={Sun} label="Best Month (lowest spend)" value={stats.bestMonth} color={rawColors.ios.green} />
          <InsightRow icon={Moon} label="Worst Month (highest spend)" value={stats.worstMonth} color={rawColors.ios.red} />
          <InsightRow
            icon={Flame}
            label="Longest no-spend streak"
            value={`${stats.maxStreak} days`}
            color={rawColors.ios.orange}
          />
          <InsightRow
            icon={TrendingDown}
            label="Biggest spending day"
            value={stats.biggestExpenseDay.date ? `${formatCurrencyCompact(stats.biggestExpenseDay.amount)}` : 'N/A'}
            subtitle={stats.biggestExpenseDay.date
              ? new Date(stats.biggestExpenseDay.date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
              : undefined}
            color={rawColors.ios.red}
          />
          <InsightRow
            icon={TrendingUp}
            label="Biggest income day"
            value={stats.biggestIncomeDay.date ? `${formatCurrencyCompact(stats.biggestIncomeDay.amount)}` : 'N/A'}
            subtitle={stats.biggestIncomeDay.date
              ? new Date(stats.biggestIncomeDay.date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
              : undefined}
            color={rawColors.ios.green}
          />
          <InsightRow
            icon={BarChart3}
            label="Days with expenses"
            value={`${stats.daysWithExpense} of ${grid.length}`}
            color={rawColors.ios.blue}
          />

          <div className="pt-3 mt-3 border-t border-white/10">
            <p className="text-xs text-gray-500 mb-1">Total Saved</p>
            <p className={`text-xl font-bold ${stats.totalSavings >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.totalSavings >= 0 ? '+' : ''}{formatCurrencyCompact(stats.totalSavings)}
            </p>
          </div>
        </motion.div>
      </div>

      {/* Day-of-Week Analysis */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl border border-white/10 p-6"
      >
        <h2 className="text-lg font-semibold mb-4">Spending by Day of Week</h2>
        <DayOfWeekChart grid={grid} />
      </motion.div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: Readonly<{
  label: string
  value: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  color: string
}>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-white/10 p-5"
    >
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl" style={{ backgroundColor: `${color}22` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <p className="text-xs text-gray-400">{label}</p>
          <p className="text-xl font-bold" style={{ color }}>{value}</p>
        </div>
      </div>
    </motion.div>
  )
}

function InsightRow({ icon: Icon, label, value, subtitle, color }: Readonly<{
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string
  subtitle?: string
  color: string
}>) {
  return (
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}15` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <div className="flex items-baseline gap-1.5">
          <p className="text-sm font-semibold text-white">{value}</p>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}

function DayOfWeekChart({ grid }: Readonly<{ grid: DayCell[] }>) {
  const data = useMemo(() => {
    const totals: Record<number, { expense: number; income: number; count: number }> = {}
    for (let i = 0; i < 7; i++) totals[i] = { expense: 0, income: 0, count: 0 }

    for (const cell of grid) {
      totals[cell.dayOfWeek].expense += cell.expense
      totals[cell.dayOfWeek].income += cell.income
      totals[cell.dayOfWeek].count++
    }

    return DAYS.map((d, i) => ({
      name: d,
      'Avg Expense': totals[i].count > 0 ? totals[i].expense / totals[i].count : 0,
      'Avg Income': totals[i].count > 0 ? totals[i].income / totals[i].count : 0,
    }))
  }, [grid])

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
          <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
          <YAxis tickFormatter={(v: number) => formatCurrencyShort(v)} tick={{ fill: '#9ca3af', fontSize: 11 }} />
          <RechartsTooltip
            formatter={(value: number | undefined) => (value === undefined ? '' : formatCurrency(value))}
            contentStyle={{ backgroundColor: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', backdropFilter: 'blur(12px)', color: '#fff' }}
            labelStyle={{ color: '#fff', fontWeight: 'bold' }}
          />
          <Bar dataKey="Avg Expense" fill={rawColors.ios.red} radius={[4, 4, 0, 0]} opacity={0.8} />
          <Bar dataKey="Avg Income" fill={rawColors.ios.green} radius={[4, 4, 0, 0]} opacity={0.8} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
