import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpRight, ArrowDownRight, Minus, GitCompareArrows, TrendingUp, TrendingDown, Equal, Upload } from 'lucide-react'
import { useState, useMemo } from 'react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import {
  getCurrentYear,
  getCurrentFY,
  getFYDateRange,
  getDateKey,
  getAvailableFYs,
} from '@/lib/dateUtils'
import { rawColors } from '@/constants/colors'
import EmptyState from '@/components/shared/EmptyState'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

// ─── Types ──────────────────────────────────────────────────────────
type CompareMode = 'month' | 'year' | 'fy'

interface PeriodSummary {
  label: string
  income: number
  expense: number
  savings: number
  savingsRate: number
  transactions: number
  categories: Record<string, { income: number; expense: number }>
}

interface CategoryDelta {
  category: string
  periodA: number
  periodB: number
  change: number
  changeAbs: number
  type: 'income' | 'expense'
}

// ─── Helpers ────────────────────────────────────────────────────────
const pctChange = (curr: number, prev: number): number => {
  if (prev === 0) return curr === 0 ? 0 : 100
  return ((curr - prev) / Math.abs(prev)) * 100
}

const getMonthOptions = (transactions: Array<{ date: string }>) => {
  const months = new Set<string>()
  for (const tx of transactions) months.add(tx.date.substring(0, 7))
  return Array.from(months).sort((a, b) => b.localeCompare(a))
}

const getYearOptions = (transactions: Array<{ date: string }>) => {
  const years = new Set<number>()
  for (const tx of transactions) years.add(Number.parseInt(tx.date.substring(0, 4)))
  return Array.from(years).sort((a, b) => b - a)
}

const formatMonthLabel = (m: string) => {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// ─── Component ──────────────────────────────────────────────────────
export default function ComparisonPage() {
  const { data: transactions = [], isLoading } = useTransactions()
  const { data: preferences } = usePreferences()
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4

  // ─── Mode & selection state ───────────────────────────────────
  const [mode, setMode] = useState<CompareMode>('month')

  // Month selectors — default to most recent 2 complete months
  const monthOptions = useMemo(() => getMonthOptions(transactions), [transactions])
  const currentMonthKey = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])
  // Default: skip current month, pick last 2 complete months
  const defaultMonths = useMemo(() => {
    const complete = monthOptions.filter((m) => m < currentMonthKey)
    return { a: complete[1] || monthOptions[1] || '', b: complete[0] || monthOptions[0] || '' }
  }, [monthOptions, currentMonthKey])
  const [monthA, setMonthA] = useState('')
  const [monthB, setMonthB] = useState('')
  const effectiveMonthA = monthA || defaultMonths.a
  const effectiveMonthB = monthB || defaultMonths.b

  // Year selectors
  const yearOptions = useMemo(() => getYearOptions(transactions), [transactions])
  const [yearA, setYearA] = useState(() => getCurrentYear() - 1)
  const [yearB, setYearB] = useState(() => getCurrentYear())

  // FY selectors
  const fyOptions = useMemo(
    () => getAvailableFYs(transactions, fiscalYearStartMonth),
    [transactions, fiscalYearStartMonth]
  )
  const [fyA, setFyA] = useState(() => {
    const curr = getCurrentFY(fiscalYearStartMonth)
    const idx = fyOptions.indexOf(curr)
    return fyOptions[idx + 1] || fyOptions.at(-1) || curr
  })
  const [fyB, setFyB] = useState(() => getCurrentFY(fiscalYearStartMonth))

  // ─── Build period summaries ───────────────────────────────────
  const buildSummary = useMemo(() => {
    return (
      label: string,
      startDate: string,
      endDate: string
    ): PeriodSummary => {
    const cats: Record<string, { income: number; expense: number }> = {}
    let income = 0
    let expense = 0
    let count = 0

    for (const tx of transactions) {
      const d = getDateKey(tx.date)
      if (d < startDate || d > endDate) continue
      count++
      const cat = tx.category || 'Uncategorized'
      if (!cats[cat]) cats[cat] = { income: 0, expense: 0 }
      if (tx.type === 'Income') {
        income += Math.abs(tx.amount)
        cats[cat].income += Math.abs(tx.amount)
      } else if (tx.type === 'Expense') {
        expense += Math.abs(tx.amount)
        cats[cat].expense += Math.abs(tx.amount)
      }
    }

    const savings = income - expense
    return {
      label,
      income,
      expense,
      savings,
      savingsRate: income > 0 ? (savings / income) * 100 : 0,
      transactions: count,
      categories: cats,
    }
  }
  }, [transactions])

  const [periodA, periodB] = useMemo((): [PeriodSummary, PeriodSummary] => {
    if (transactions.length === 0) {
      const empty: PeriodSummary = { label: '-', income: 0, expense: 0, savings: 0, savingsRate: 0, transactions: 0, categories: {} }
      return [empty, empty]
    }

    if (mode === 'month') {
      const aStart = `${effectiveMonthA}-01`
      const [ay, am] = effectiveMonthA.split('-').map(Number)
      const aEnd = `${effectiveMonthA}-${new Date(ay, am, 0).getDate()}`
      const bStart = `${effectiveMonthB}-01`
      const [by, bm] = effectiveMonthB.split('-').map(Number)
      const bEnd = `${effectiveMonthB}-${new Date(by, bm, 0).getDate()}`
      return [
        buildSummary(formatMonthLabel(effectiveMonthA), aStart, aEnd),
        buildSummary(formatMonthLabel(effectiveMonthB), bStart, bEnd),
      ]
    }

    if (mode === 'year') {
      return [
        buildSummary(String(yearA), `${yearA}-01-01`, `${yearA}-12-31`),
        buildSummary(String(yearB), `${yearB}-01-01`, `${yearB}-12-31`),
      ]
    }

    // FY
    const rangeA = getFYDateRange(fyA, fiscalYearStartMonth)
    const rangeB = getFYDateRange(fyB, fiscalYearStartMonth)
    return [
      buildSummary(fyA, rangeA.start, rangeA.end),
      buildSummary(fyB, rangeB.start, rangeB.end),
    ]
  }, [transactions, buildSummary, mode, effectiveMonthA, effectiveMonthB, yearA, yearB, fyA, fyB, fiscalYearStartMonth])

  // ─── Category deltas ──────────────────────────────────────────
  const categoryDeltas = useMemo((): CategoryDelta[] => {
    const allCats = new Set([...Object.keys(periodA.categories), ...Object.keys(periodB.categories)])
    const deltas: CategoryDelta[] = []

    for (const cat of allCats) {
      const a = periodA.categories[cat] || { income: 0, expense: 0 }
      const b = periodB.categories[cat] || { income: 0, expense: 0 }

      if (a.expense > 0 || b.expense > 0) {
        deltas.push({
          category: cat,
          periodA: a.expense,
          periodB: b.expense,
          change: pctChange(b.expense, a.expense),
          changeAbs: b.expense - a.expense,
          type: 'expense',
        })
      }
      if (a.income > 0 || b.income > 0) {
        deltas.push({
          category: cat,
          periodA: a.income,
          periodB: b.income,
          change: pctChange(b.income, a.income),
          changeAbs: b.income - a.income,
          type: 'income',
        })
      }
    }

    return deltas.sort((x, y) => Math.abs(y.changeAbs) - Math.abs(x.changeAbs))
  }, [periodA, periodB])

  const expenseDeltas = categoryDeltas.filter((d) => d.type === 'expense')
  const incomeDeltas = categoryDeltas.filter((d) => d.type === 'income')

  // ─── Bar chart data ───────────────────────────────────────────
  const chartData = useMemo(
    () => [
      { metric: 'Income', [periodA.label]: periodA.income, [periodB.label]: periodB.income },
      { metric: 'Expenses', [periodA.label]: periodA.expense, [periodB.label]: periodB.expense },
      { metric: 'Savings', [periodA.label]: periodA.savings, [periodB.label]: periodB.savings },
    ],
    [periodA, periodB]
  )

  // ─── Render helpers ───────────────────────────────────────────
  const changeIcon = (val: number) => {
    if (Math.abs(val) < 1) return <Minus className="w-4 h-4 text-gray-400" />
    return val > 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />
  }

  const changeColor = (val: number, invert = false) => {
    if (Math.abs(val) < 1) return 'text-gray-400'
    const positive = val > 0
    if (invert) return positive ? 'text-red-400' : 'text-green-400'
    return positive ? 'text-green-400' : 'text-red-400'
  }

  // ─── Render ───────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-10 w-72 bg-white/5 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={`skel-${i}`} className="h-48 bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="p-8">
        <EmptyState
          title="No transactions yet"
          description="Upload your Excel data to start comparing periods."
          icon={Upload}
        />
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl" style={{ backgroundColor: `${rawColors.ios.indigo}22` }}>
              <GitCompareArrows className="w-7 h-7" style={{ color: rawColors.ios.indigo }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Period Comparison</h1>
              <p className="text-sm text-gray-400">Compare two periods side-by-side — income, expenses, savings &amp; categories</p>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="flex items-center gap-1 p-1 glass-thin rounded-xl" role="tablist">
            {([['month', 'Month'], ['year', 'Year'], ['fy', 'FY']] as const).map(([val, label]) => (
              <motion.button
                key={val}
                role="tab"
                aria-selected={mode === val}
                onClick={() => setMode(val)}
                className={`relative px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  mode === val ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
                whileTap={{ scale: 0.97 }}
              >
                {mode === val && (
                  <motion.div
                    layoutId="comparisonModeTab"
                    className="absolute inset-0 rounded-lg"
                    style={{ backgroundColor: rawColors.ios.indigo }}
                    initial={false}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative z-10">{label}</span>
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Period Selectors */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-white/10 p-5"
      >
        <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
          <PeriodSelector
            mode={mode}
            label="Period A"
            monthOptions={monthOptions}
            yearOptions={yearOptions}
            fyOptions={fyOptions}
            month={effectiveMonthA}
            year={yearA}
            fy={fyA}
            onMonth={setMonthA}
            onYear={setYearA}
            onFy={setFyA}
          />
          <div className="flex items-center gap-2 text-gray-400">
            <Equal className="w-5 h-5" />
            <span className="text-sm font-medium">vs</span>
          </div>
          <PeriodSelector
            mode={mode}
            label="Period B"
            monthOptions={monthOptions}
            yearOptions={yearOptions}
            fyOptions={fyOptions}
            month={effectiveMonthB}
            year={yearB}
            fy={fyB}
            onMonth={setMonthB}
            onYear={setYearB}
            onFy={setFyB}
          />
        </div>
      </motion.div>

      {/* KPI Overview */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${periodA.label}-${periodB.label}`}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
        >
          <KpiCard
            title="Income"
            valueA={periodA.income}
            valueB={periodB.income}
            labelA={periodA.label}
            labelB={periodB.label}
            color={rawColors.ios.green}
          />
          <KpiCard
            title="Expenses"
            valueA={periodA.expense}
            valueB={periodB.expense}
            labelA={periodA.label}
            labelB={periodB.label}
            color={rawColors.ios.red}
            invertChange
          />
          <KpiCard
            title="Savings"
            valueA={periodA.savings}
            valueB={periodB.savings}
            labelA={periodA.label}
            labelB={periodB.label}
            color={rawColors.ios.blue}
          />
          <KpiCard
            title="Savings Rate"
            valueA={periodA.savingsRate}
            valueB={periodB.savingsRate}
            labelA={periodA.label}
            labelB={periodB.label}
            color={rawColors.ios.purple}
            isPercent
          />
        </motion.div>
      </AnimatePresence>

      {/* Side-by-side bar chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl border border-white/10 p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold mb-4">Overview</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={chartData} barGap={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="metric" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis tickFormatter={(v: number) => formatCurrencyShort(v)} tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip
                formatter={(value: number | undefined) => value !== undefined ? formatCurrency(value) : ''}
                contentStyle={{
                  backgroundColor: 'rgba(0,0,0,0.9)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  color: '#fff',
                }}
                labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                itemStyle={{ color: '#9ca3af' }}
              />
              <Legend />
              <Bar dataKey={periodA.label} fill={rawColors.ios.blue} radius={[4, 4, 0, 0]} />
              <Bar dataKey={periodB.label} fill={rawColors.ios.indigo} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Category Breakdown Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expense Categories */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-2xl border border-white/10 p-6 shadow-xl"
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-5 h-5 text-red-400" />
            <h2 className="text-lg font-semibold">Expense Categories</h2>
          </div>
          {expenseDeltas.length === 0 ? (
            <p className="text-sm text-gray-400">No expense data for selected periods.</p>
          ) : (
            <div className="space-y-2 max-h-105 overflow-y-auto pr-1">
              {expenseDeltas.map((d) => (
                <div
                  key={d.category}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/3 hover:bg-white/6 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.category}</p>
                    <p className="text-xs text-gray-400">
                      {formatCurrency(d.periodA)} → {formatCurrency(d.periodB)}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1 ml-3 ${changeColor(d.change, true)}`}>
                    {changeIcon(d.change)}
                    <span className="text-sm font-semibold whitespace-nowrap">
                      {d.change > 0 ? '+' : ''}{d.change.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Income Categories */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl border border-white/10 p-6 shadow-xl"
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-green-400" />
            <h2 className="text-lg font-semibold">Income Categories</h2>
          </div>
          {incomeDeltas.length === 0 ? (
            <p className="text-sm text-gray-400">No income data for selected periods.</p>
          ) : (
            <div className="space-y-2 max-h-105 overflow-y-auto pr-1">
              {incomeDeltas.map((d) => (
                <div
                  key={d.category}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/3 hover:bg-white/6 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.category}</p>
                    <p className="text-xs text-gray-400">
                      {formatCurrency(d.periodA)} → {formatCurrency(d.periodB)}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1 ml-3 ${changeColor(d.change)}`}>
                    {changeIcon(d.change)}
                    <span className="text-sm font-semibold whitespace-nowrap">
                      {d.change > 0 ? '+' : ''}{d.change.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Transaction Count & Quick Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="glass rounded-2xl border border-white/10 p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold mb-4">Quick Stats</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickStat label="Transactions" valueA={periodA.transactions} valueB={periodB.transactions} labelA={periodA.label} labelB={periodB.label} />
          <QuickStat label="Avg Daily Spend" valueA={periodA.expense / 30} valueB={periodB.expense / 30} labelA={periodA.label} labelB={periodB.label} isCurrency />
          <QuickStat label="Categories Used" valueA={Object.keys(periodA.categories).length} valueB={Object.keys(periodB.categories).length} labelA={periodA.label} labelB={periodB.label} />
          <QuickStat
            label="Top Expense"
            valueA={
              Math.max(...Object.values(periodA.categories).map((c) => c.expense), 0)
            }
            valueB={
              Math.max(...Object.values(periodB.categories).map((c) => c.expense), 0)
            }
            labelA={periodA.label}
            labelB={periodB.label}
            isCurrency
          />
        </div>
      </motion.div>
    </div>
  )
}

// ─── Sub components ─────────────────────────────────────────────────

function PeriodSelector({
  mode,
  label,
  monthOptions,
  yearOptions,
  fyOptions,
  month,
  year,
  fy,
  onMonth,
  onYear,
  onFy,
}: Readonly<{
  mode: CompareMode
  label: string
  monthOptions: string[]
  yearOptions: number[]
  fyOptions: string[]
  month: string
  year: number
  fy: string
  onMonth: (m: string) => void
  onYear: (y: number) => void
  onFy: (f: string) => void
}>) {
  const selectClass =
    'px-3 py-2 rounded-lg bg-zinc-800 border border-white/10 text-sm text-white cursor-pointer hover:bg-zinc-700 transition-colors [&>option]:bg-zinc-800 [&>option]:text-white'

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-xs text-gray-400 font-medium">{label}</span>
      {mode === 'month' && (
        <select className={selectClass} value={month} onChange={(e) => onMonth(e.target.value)}>
          {monthOptions.map((m) => (
            <option key={m} value={m}>{formatMonthLabel(m)}</option>
          ))}
        </select>
      )}
      {mode === 'year' && (
        <select className={selectClass} value={year} onChange={(e) => onYear(Number(e.target.value))}>
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      )}
      {mode === 'fy' && (
        <select className={selectClass} value={fy} onChange={(e) => onFy(e.target.value)}>
          {fyOptions.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      )}
    </div>
  )
}

function KpiCard({
  title,
  valueA,
  valueB,
  labelA,
  labelB,
  color,
  invertChange,
  isPercent,
}: Readonly<{
  title: string
  valueA: number
  valueB: number
  labelA: string
  labelB: string
  color: string
  invertChange?: boolean
  isPercent?: boolean
}>) {
  const change = isPercent ? valueB - valueA : pctChange(valueB, valueA)
  const isPositive = change >= 0
  const isGood = invertChange ? !isPositive : isPositive
  const fmtVal = (v: number) => (isPercent ? `${v.toFixed(1)}%` : formatCurrency(v))

  return (
    <motion.div
      className="glass rounded-2xl border border-white/10 p-5 shadow-xl"
      whileHover={{ scale: 1.01 }}
    >
      <p className="text-sm text-gray-400 mb-1">{title}</p>
      <div className="flex items-end gap-2 mb-3">
        <span className="text-2xl font-bold" style={{ color }}>{fmtVal(valueB)}</span>
      </div>
      <div className="text-xs text-gray-400 mb-2">
        <span className="opacity-60">{labelA}:</span> {fmtVal(valueA)}
      </div>
      <div className={`flex items-center gap-1 text-sm font-medium ${isGood ? 'text-green-400' : 'text-red-400'}`}>
        {Math.abs(change) < 1 ? (
          <Minus className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          isPositive
            ? <ArrowUpRight className="w-3.5 h-3.5" />
            : <ArrowDownRight className="w-3.5 h-3.5" />
        )}
        <span>
          {change > 0 ? '+' : ''}{change.toFixed(1)}{isPercent ? ' pts' : '%'}
        </span>
      </div>
    </motion.div>
  )
}

function QuickStat({
  label,
  valueA,
  valueB,
  labelA,
  labelB,
  isCurrency,
}: Readonly<{
  label: string
  valueA: number
  valueB: number
  labelA: string
  labelB: string
  isCurrency?: boolean
}>) {
  const fmt = (v: number) => (isCurrency ? formatCurrencyShort(v) : String(Math.round(v)))

  return (
    <div className="p-4 rounded-xl bg-white/3">
      <p className="text-xs text-gray-400 mb-2">{label}</p>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-sm text-gray-400">{labelA}</p>
          <p className="text-base font-semibold">{fmt(valueA)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-400">{labelB}</p>
          <p className="text-base font-semibold">{fmt(valueB)}</p>
        </div>
      </div>
    </div>
  )
}
